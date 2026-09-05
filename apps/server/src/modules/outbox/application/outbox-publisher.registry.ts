import { outboxTopicSchema } from '@lingcoo-edu-oms/contracts';

import type { OutboxEventDefinition, OutboxPublisherDefinition } from '../domain/model.js';

export interface ResolvedOutboxEventDefinition<
  TPayload = unknown,
> extends OutboxEventDefinition<TPayload> {
  topic: string;
  eventVersion: number;
  maxAttempts: number;
  leaseMs: number;
  timeoutMs: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export class OutboxEventRegistry {
  private readonly definitions = new Map<string, ResolvedOutboxEventDefinition>();
  private readonly currentVersions = new Map<string, number>();

  constructor(definitions: OutboxEventDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register<TPayload>(definition: OutboxEventDefinition<TPayload>): void {
    const topic = outboxTopicSchema.parse(definition.topic);
    const eventVersion = definition.eventVersion ?? 1;
    const identity = this.identity(topic, eventVersion);
    if (this.definitions.has(identity)) {
      throw new Error(`Outbox event already registered: ${topic}@${eventVersion}`);
    }
    const maxAttempts = definition.maxAttempts ?? 10;
    const leaseMs = definition.leaseMs ?? 60_000;
    const timeoutMs = definition.timeoutMs ?? 15 * 60_000;
    const backoffBaseMs = definition.backoffBaseMs ?? 5_000;
    const backoffMaxMs = definition.backoffMaxMs ?? 60 * 60_000;
    if (!Number.isInteger(eventVersion) || eventVersion < 1 || eventVersion > 1_000)
      throw new Error('Outbox event version must be between 1 and 1000');
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20)
      throw new Error('Outbox max attempts must be between 1 and 20');
    if (!Number.isInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 15 * 60_000)
      throw new Error('Outbox lease must be between 1 second and 15 minutes');
    if (!Number.isInteger(timeoutMs) || timeoutMs < leaseMs || timeoutMs > 24 * 60 * 60_000)
      throw new Error('Outbox timeout must be at least one lease and no more than 24 hours');
    if (
      !Number.isInteger(backoffBaseMs) ||
      backoffBaseMs < 100 ||
      !Number.isInteger(backoffMaxMs) ||
      backoffMaxMs < backoffBaseMs ||
      backoffMaxMs > 24 * 60 * 60_000
    )
      throw new Error('Outbox backoff configuration is invalid');
    this.definitions.set(identity, {
      ...definition,
      topic,
      eventVersion,
      maxAttempts,
      leaseMs,
      timeoutMs,
      backoffBaseMs,
      backoffMaxMs,
    } as ResolvedOutboxEventDefinition);
    this.currentVersions.set(topic, Math.max(eventVersion, this.currentVersions.get(topic) ?? 0));
  }

  get(topic: string, eventVersion?: number) {
    const parsedTopic = outboxTopicSchema.parse(topic);
    const version = eventVersion ?? this.currentVersions.get(parsedTopic);
    return version ? (this.definitions.get(this.identity(parsedTopic, version)) ?? null) : null;
  }

  require(topic: string) {
    const definition = this.get(outboxTopicSchema.parse(topic));
    if (!definition) throw new Error(`Outbox event is not registered: ${topic}`);
    return definition;
  }

  private identity(topic: string, eventVersion: number) {
    return `${topic}@${eventVersion}`;
  }
}

export class OutboxPublisherRegistry {
  private readonly definitions = new Map<string, OutboxPublisherDefinition>();

  constructor(definitions: OutboxPublisherDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register<TPayload>(definition: OutboxPublisherDefinition<TPayload>): void {
    const topic = outboxTopicSchema.parse(definition.topic);
    if (this.definitions.has(topic))
      throw new Error(`Outbox publisher already registered: ${topic}`);
    this.definitions.set(topic, definition as OutboxPublisherDefinition);
  }

  get(topic: string) {
    return this.definitions.get(topic) ?? null;
  }

  require(topic: string) {
    const definition = this.get(outboxTopicSchema.parse(topic));
    if (!definition) throw new Error(`Outbox publisher is not registered: ${topic}`);
    return definition;
  }
}
