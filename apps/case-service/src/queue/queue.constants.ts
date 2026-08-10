/**
 * Queue registry.
 *
 * Every queue in the platform is named here rather than by string literal at
 * the call site, so the set of background work is enumerable — a BNM examiner
 * asking "what runs automatically, and what proves it ran?" gets one answer.
 */
export const QUEUE = {
  /** SLA clock ticks: due-soon warnings and breach escalation (PD 12.5, CSP). */
  SLA: 'sla',
  /** Outbound notifications — email first, SMS/WhatsApp later. */
  NOTIFICATIONS: 'notifications',
  /** Retention and anonymisation sweeps (PD 12.8 seven-year floor). */
  RETENTION: 'retention',
  /** FNOL email intake: poll the dedicated mailbox, parse, create Cases. */
  INGESTION: 'ingestion',
} as const;

export type QueueName = (typeof QUEUE)[keyof typeof QUEUE];

/**
 * Key prefix for every BullMQ structure in Redis.
 *
 * Not cosmetic: developer machines routinely run more than one Redis-backed
 * project, and an unprefixed queue named `sla` would happily consume another
 * application's jobs. Namespacing makes a shared or misconfigured Redis a
 * visible mistake rather than silent cross-talk.
 */
export const QUEUE_PREFIX = 'tci';

/**
 * Job retention. Failed jobs are kept far longer than successful ones because a
 * failure is evidence: "the breach escalation did not fire" is a question the
 * audit trail must be able to answer weeks later.
 */
export const JOB_RETENTION = {
  removeOnComplete: { age: 60 * 60 * 24 * 7, count: 5_000 },
  removeOnFail: { age: 60 * 60 * 24 * 30 },
} as const;
