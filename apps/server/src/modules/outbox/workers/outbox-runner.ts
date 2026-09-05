import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import type { Logger } from 'pino';

import type { AppEnvironment } from '../../../config/environment.js';
import type { OutboxService } from '../application/outbox.service.js';
import type { StoredOutboxEvent } from '../infrastructure/persistence/outbox.repository.js';

interface ActivePublication {
  abort: AbortController;
  promise: Promise<void>;
}

export class OutboxRunner {
  private readonly workerId: string;
  private readonly active = new Map<string, ActivePublication>();
  private stopping = false;
  private loopPromise: Promise<void> | null = null;
  private wakeLoop: (() => void) | null = null;
  private lastMaintenanceAt = 0;

  constructor(
    private readonly environment: AppEnvironment,
    private readonly outbox: OutboxService,
    private readonly logger: Logger,
    workerId?: string,
  ) {
    this.workerId =
      workerId ??
      environment.OUTBOX_WORKER_ID ??
      `${hostname()}:${process.pid}:outbox:${randomUUID().slice(0, 8)}`;
  }

  id() {
    return this.workerId;
  }

  start() {
    if (this.loopPromise) return;
    this.stopping = false;
    this.loopPromise = this.loop().finally(() => {
      this.loopPromise = null;
    });
  }

  async stop() {
    this.stopping = true;
    this.wakeLoop?.();
    await this.loopPromise;
    const running = [...this.active.values()];
    if (!running.length) return;
    const settled = Promise.allSettled(running.map((execution) => execution.promise));
    const graceful = await Promise.race([
      settled.then(() => true),
      this.delay(this.environment.OUTBOX_SHUTDOWN_GRACE_MS).then(() => false),
    ]);
    if (graceful) return;
    for (const execution of this.active.values()) {
      execution.abort.abort(new Error('Outbox Publisher is shutting down'));
    }
    const aborted = await Promise.race([
      settled.then(() => true),
      this.delay(1_000).then(() => false),
    ]);
    if (!aborted) {
      this.logger.fatal(
        { activePublications: this.active.size },
        'outbox handlers ignored shutdown; terminating worker without closing shared resources',
      );
      throw new Error('Outbox Publisher shutdown timed out');
    }
  }

  async runOnce() {
    const recovered = await this.outbox.recoverStale(this.environment.OUTBOX_STALE_RECOVERY_BATCH);
    if (recovered.length)
      this.logger.warn({ count: recovered.length }, 'recovered stale outbox events');
    await this.runMaintenance();
    const capacity = this.environment.OUTBOX_CONCURRENCY - this.active.size;
    if (capacity <= 0 || this.stopping) return 0;
    const claimed = await this.outbox.claim(this.workerId, capacity);
    for (const event of claimed) this.launch(event);
    return claimed.length;
  }

  async waitForIdle() {
    await Promise.allSettled([...this.active.values()].map((execution) => execution.promise));
  }

  private async loop() {
    this.logger.info({ workerId: this.workerId }, 'outbox publisher ready');
    while (!this.stopping) {
      try {
        await this.runOnce();
      } catch (error) {
        this.logger.error({ error: this.errorMetadata(error) }, 'outbox publisher poll failed');
      }
      if (!this.stopping) await this.interruptibleDelay(this.environment.OUTBOX_POLL_INTERVAL_MS);
    }
  }

  private launch(event: StoredOutboxEvent) {
    const abort = new AbortController();
    const promise = this.execute(event, abort)
      .catch((error: unknown) => {
        this.logger.error(
          { error: this.errorMetadata(error), eventId: event.id, topic: event.topic },
          'outbox publication failed',
        );
      })
      .finally(() => this.active.delete(event.id));
    this.active.set(event.id, { abort, promise });
  }

  private async execute(event: StoredOutboxEvent, abort: AbortController) {
    let timedOut = false;
    let ownershipLost = false;
    let heartbeatRunning = false;
    const token = event.claimToken!;
    const timeout = setTimeout(
      () => {
        timedOut = true;
        abort.abort(new Error('Outbox publication timed out'));
      },
      Math.max(1, event.executionDeadline!.getTime() - Date.now()),
    );
    const heartbeat = setInterval(
      () => {
        if (heartbeatRunning || timedOut || ownershipLost) return;
        heartbeatRunning = true;
        void this.outbox
          .heartbeat(event.id, token)
          .then((owned) => {
            if (!owned) {
              ownershipLost = true;
              abort.abort(new Error('Outbox claim ownership was lost'));
            }
          })
          .catch((error: unknown) => {
            this.logger.error(
              { error: this.errorMetadata(error), eventId: event.id },
              'outbox heartbeat failed',
            );
            ownershipLost = true;
            abort.abort(new Error('Outbox heartbeat failed; ownership cannot be guaranteed'));
          })
          .finally(() => {
            heartbeatRunning = false;
          });
      },
      Math.max(
        250,
        Math.min(
          this.environment.OUTBOX_HEARTBEAT_INTERVAL_MS,
          Math.floor(event.leaseDurationMs / 3),
        ),
      ),
    );
    try {
      const { publisher, envelope } = this.outbox.resolvePublisher(event);
      await publisher.handler(envelope, {
        eventId: event.id,
        attemptNumber: event.attemptCount,
        signal: abort.signal,
      });
      if (timedOut) {
        await this.outbox.fail(event, token, abort.signal.reason, {
          code: 'OUTBOX_PUBLISH_TIMED_OUT',
          message: 'Outbox Event 发布超过最大允许时间',
          statusCode: 504,
          retryable: true,
        });
      } else if (ownershipLost) {
        this.logger.warn({ eventId: event.id }, 'outbox completion ignored after ownership loss');
      } else if (abort.signal.aborted) {
        await this.outbox.fail(event, token, abort.signal.reason, {
          code: 'OUTBOX_PUBLISHER_SHUTDOWN',
          message: 'Publisher 关闭时中止了 Outbox Event',
          statusCode: 503,
          retryable: true,
        });
      } else if (!(await this.outbox.publish(event.id, token))) {
        this.logger.warn({ eventId: event.id }, 'outbox completion ignored after ownership loss');
      }
    } catch (error) {
      if (!ownershipLost) {
        await this.outbox.fail(
          event,
          token,
          error,
          timedOut
            ? {
                code: 'OUTBOX_PUBLISH_TIMED_OUT',
                message: 'Outbox Event 发布超过最大允许时间',
                statusCode: 504,
                retryable: true,
              }
            : undefined,
        );
      }
    } finally {
      clearTimeout(timeout);
      clearInterval(heartbeat);
    }
  }

  private async runMaintenance() {
    const now = Date.now();
    if (now - this.lastMaintenanceAt < this.environment.OUTBOX_MAINTENANCE_INTERVAL_MS) return;
    const before = new Date(now - this.environment.OUTBOX_RETENTION_DAYS * 24 * 60 * 60_000);
    const removed = await this.outbox.purgePublished(before, 100);
    if (removed) this.logger.info({ count: removed }, 'purged published outbox events');
    this.lastMaintenanceAt = now;
  }

  private interruptibleDelay(milliseconds: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        this.wakeLoop = null;
        resolve();
      }, milliseconds);
      this.wakeLoop = () => {
        clearTimeout(timer);
        this.wakeLoop = null;
        resolve();
      };
    });
  }

  private delay(milliseconds: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  }

  private errorMetadata(error: unknown) {
    if (!error || typeof error !== 'object') return { name: typeof error };
    const candidate = error as { name?: unknown; code?: unknown };
    return {
      name: typeof candidate.name === 'string' ? candidate.name.slice(0, 80) : 'Error',
      code:
        typeof candidate.code === 'string' && /^[A-Z0-9_]{2,80}$/.test(candidate.code)
          ? candidate.code
          : undefined,
    };
  }
}
