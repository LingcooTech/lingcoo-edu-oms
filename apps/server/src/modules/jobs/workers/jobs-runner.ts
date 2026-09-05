import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import type { Logger } from 'pino';

import type { AppEnvironment } from '../../../config/environment.js';
import type { StoredJob } from '../infrastructure/persistence/jobs.repository.js';
import type { RecurringJobRegistry } from '../application/recurring-job.registry.js';
import type { JobsService } from '../application/jobs.service.js';

interface ActiveExecution {
  abort: AbortController;
  promise: Promise<void>;
}

export class JobsRunner {
  private readonly workerId: string;
  private readonly active = new Map<string, ActiveExecution>();
  private stopping = false;
  private loopPromise: Promise<void> | null = null;
  private wakeLoop: (() => void) | null = null;
  private lastMaintenanceAt = 0;

  constructor(
    private readonly environment: AppEnvironment,
    private readonly jobs: JobsService,
    private readonly recurring: RecurringJobRegistry,
    private readonly queues: readonly string[],
    private readonly logger: Logger,
    workerId?: string,
  ) {
    this.workerId =
      workerId ??
      environment.JOBS_WORKER_ID ??
      `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  }

  id(): string {
    return this.workerId;
  }

  start(): void {
    if (this.loopPromise) return;
    this.stopping = false;
    this.loopPromise = this.loop().finally(() => {
      this.loopPromise = null;
    });
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.wakeLoop?.();
    await this.loopPromise;
    const running = [...this.active.values()];
    if (running.length === 0) return;
    const settled = Promise.allSettled(running.map((execution) => execution.promise));
    const graceful = await Promise.race([
      settled.then(() => true),
      this.delay(this.environment.JOBS_SHUTDOWN_GRACE_MS).then(() => false),
    ]);
    if (graceful) return;
    for (const execution of this.active.values()) {
      execution.abort.abort(new Error('Job worker is shutting down'));
    }
    await Promise.race([settled, this.delay(1_000)]);
  }

  async runOnce(): Promise<number> {
    for (const due of this.recurring.due(new Date())) {
      await this.jobs.enqueue(due);
    }
    const recovered = await this.jobs.recoverStale(this.environment.JOBS_STALE_RECOVERY_BATCH);
    if (recovered.length > 0) {
      this.logger.warn({ count: recovered.length }, 'recovered stale jobs');
    }
    await this.runMaintenance();
    let capacity = this.environment.JOBS_CONCURRENCY - this.active.size;
    let started = 0;
    for (const queue of this.queues) {
      if (capacity <= 0 || this.stopping) break;
      const claimed = await this.jobs.claim(queue, this.workerId, capacity);
      for (const job of claimed) this.launch(job);
      started += claimed.length;
      capacity -= claimed.length;
    }
    return started;
  }

  async waitForIdle(): Promise<void> {
    await Promise.allSettled([...this.active.values()].map((execution) => execution.promise));
  }

  private async loop(): Promise<void> {
    this.logger.info({ workerId: this.workerId }, 'job worker ready');
    while (!this.stopping) {
      try {
        await this.runOnce();
      } catch (error) {
        this.logger.error({ err: error }, 'job worker poll failed');
      }
      if (!this.stopping) await this.interruptibleDelay(this.environment.JOBS_POLL_INTERVAL_MS);
    }
  }

  private launch(job: StoredJob): void {
    const abort = new AbortController();
    const promise = this.execute(job, abort)
      .catch((error: unknown) => {
        this.logger.error({ err: error, jobId: job.id, type: job.type }, 'job execution failed');
      })
      .finally(() => {
        this.active.delete(job.id);
      });
    this.active.set(job.id, { abort, promise });
  }

  private async execute(job: StoredJob, abort: AbortController): Promise<void> {
    let timedOut = false;
    let ownershipLost = false;
    let heartbeatRunning = false;
    const claimToken = job.claimToken!;
    const timeoutMs = Math.max(1, job.executionDeadline!.getTime() - Date.now());
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort(new Error('Job execution timed out'));
    }, timeoutMs);
    const heartbeatMs = Math.max(
      250,
      Math.min(this.environment.JOBS_HEARTBEAT_INTERVAL_MS, Math.floor(job.leaseDurationMs / 3)),
    );
    const heartbeat = setInterval(() => {
      if (heartbeatRunning || timedOut || ownershipLost) return;
      heartbeatRunning = true;
      void this.jobs
        .heartbeat(job.id, claimToken)
        .then((owned) => {
          if (!owned) {
            ownershipLost = true;
            abort.abort(new Error('Job claim ownership was lost'));
          }
        })
        .catch((error: unknown) => {
          this.logger.error({ err: error, jobId: job.id }, 'job heartbeat failed');
          ownershipLost = true;
          abort.abort(new Error('Job heartbeat failed; ownership can no longer be guaranteed'));
        })
        .finally(() => {
          heartbeatRunning = false;
        });
    }, heartbeatMs);

    try {
      const { definition, payload } = this.jobs.resolveHandler(job);
      await definition.handler(payload, {
        jobId: job.id,
        attemptNumber: job.attemptCount,
        signal: abort.signal,
      });
      if (timedOut) {
        await this.jobs.fail(job, claimToken, abort.signal.reason, {
          code: 'JOB_EXECUTION_TIMED_OUT',
          message: 'Job 执行超过最大允许时间',
          statusCode: 504,
          retryable: true,
        });
      } else if (ownershipLost) {
        this.logger.warn({ jobId: job.id }, 'job completion ignored after ownership loss');
      } else if (abort.signal.aborted) {
        await this.jobs.fail(job, claimToken, abort.signal.reason, {
          code: 'JOB_WORKER_SHUTDOWN',
          message: 'Worker 关闭时中止了 Job',
          statusCode: 503,
          retryable: true,
        });
      } else {
        const succeeded = await this.jobs.succeed(job.id, claimToken);
        if (!succeeded) {
          this.logger.warn({ jobId: job.id }, 'job completion ignored after ownership loss');
        }
      }
    } catch (error) {
      if (!ownershipLost) {
        await this.jobs.fail(
          job,
          claimToken,
          error,
          timedOut
            ? {
                code: 'JOB_EXECUTION_TIMED_OUT',
                message: 'Job 执行超过最大允许时间',
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

  private async runMaintenance(): Promise<void> {
    const now = Date.now();
    if (now - this.lastMaintenanceAt < this.environment.JOBS_MAINTENANCE_INTERVAL_MS) return;
    const before = new Date(now - this.environment.JOBS_RETENTION_DAYS * 24 * 60 * 60_000);
    const removed = await this.jobs.purgeCompleted(before, 100);
    if (removed > 0) this.logger.info({ count: removed }, 'purged completed jobs');
    this.lastMaintenanceAt = now;
  }

  private interruptibleDelay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
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

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
