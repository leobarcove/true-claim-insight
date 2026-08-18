import { BullModule } from '@nestjs/bullmq';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JOB_RETENTION, QUEUE, QUEUE_PREFIX } from './queue.constants';

/**
 * Durable background work, on the Redis that docker-compose already provides.
 *
 * Why a queue at all: every CSP and PD 12.5 turnaround obligation is a deadline
 * that must survive a process restart. A `setTimeout` in a request handler
 * cannot prove a clock was running, and losing a breach escalation is not a
 * missed notification — it is a compliance failure with no record. BullMQ gives
 * durable, retried, inspectable jobs; the same worker pattern then carries
 * notifications and retention sweeps rather than each growing its own scheduler
 * (docs/MASTER_PLAN.md §5 Phase 1).
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redis.url');

        if (!url) {
          // Fail at boot. A silent fallback to localhost:6379 is how jobs end up
          // in whatever unrelated Redis happens to be listening.
          throw new Error(
            'REDIS_URL is not set. Background work (SLA clocks, notifications, ' +
              'retention) cannot be scheduled without it. docker-compose publishes ' +
              'Redis on 6380 — see .env.example.'
          );
        }

        new Logger('QueueModule').log(`Queues on ${redact(url)} (prefix "${QUEUE_PREFIX}")`);

        return {
          connection: { url },
          prefix: QUEUE_PREFIX,
          defaultJobOptions: {
            ...JOB_RETENTION,
            attempts: 5,
            // Exponential backoff: a transient failure (SMTP blip, provider
            // timeout) should not burn all attempts in the same second.
            backoff: { type: 'exponential', delay: 5_000 },
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: QUEUE.SLA },
      { name: QUEUE.NOTIFICATIONS },
      { name: QUEUE.RETENTION },
      { name: QUEUE.INGESTION },
      { name: QUEUE.CASES }
    ),
  ],
  exports: [BullModule],
})
export class QueueModule {}

/** Never log Redis credentials, even in development. */
function redact(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) parsed.password = '***';
    return parsed.toString();
  } catch {
    return '(unparseable REDIS_URL)';
  }
}
