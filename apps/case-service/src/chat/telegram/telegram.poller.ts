import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ConversationGateway, TurnNotRecordedError } from '../conversation.gateway';
import { TelegramAdapter } from './telegram.adapter';
import type { TelegramUpdate } from './telegram.types';

/**
 * Long-polling ingress for Telegram, for development.
 *
 * Telegram offers two ways in: `getUpdates` long-polling, which needs no
 * inbound network path at all, and webhooks, which need a public HTTPS URL.
 * Polling is what makes local development work without a tunnel, and it is why
 * this module lives inside case-service rather than behind the public edge —
 * there is nothing public about it.
 *
 * A webhook implementation belongs here too when staging needs it, proxied in
 * through api-gateway like every other route. The adapter is unchanged either
 * way: ingress is a transport detail, the same separation InboundMailSource
 * draws for FNOL email.
 *
 * Inert without a bot token. `TELEGRAM_POLLING_ENABLED=false` also stops it,
 * so a deployment can hold a token for sending without competing for updates —
 * two pollers on one bot each receive half the messages, which presents as
 * claimants being intermittently ignored.
 */
@Injectable()
export class TelegramPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramPoller.name);
  private running = false;
  private offset = 0;
  private timer?: NodeJS.Timeout;

  /** Telegram holds the connection open this long when there is nothing new. */
  private static readonly LONG_POLL_SECONDS = 25;
  /** Backoff after a failed poll, so an outage does not become a hot loop. */
  private static readonly ERROR_BACKOFF_MS = 5_000;
  /** How often to look for turns that were recorded and never processed. */
  private static readonly RECONCILE_INTERVAL_MS = 5 * 60_000;
  /** A turn still PENDING after this was abandoned, not merely slow. */
  private static readonly STALLED_AFTER_MS = 10 * 60_000;

  private lastReconcileAt = 0;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly adapter: TelegramAdapter,
    private readonly gateway: ConversationGateway
  ) {}

  onModuleInit(): void {
    if (!this.adapter.isConfigured()) {
      this.logger.log('TELEGRAM_BOT_TOKEN not set — Telegram channel is off.');
      return;
    }
    // Opt-in, not opt-out. Long-polling is a fleet-wide singleton — two
    // pollers on one token each receive half the updates, which presents as
    // claimants being intermittently ignored rather than as an outage. A
    // default of "on wherever a token is present" is how a second environment
    // silently halves the first; every default fails closed (§4.2).
    if (this.config.get('TELEGRAM_POLLING_ENABLED') !== 'true') {
      this.logger.log(
        'Telegram polling is off — set TELEGRAM_POLLING_ENABLED=true on exactly one instance per bot token.'
      );
      return;
    }
    this.running = true;
    void this.loop();
    this.logger.log('Telegram long-polling started.');
  }

  onModuleDestroy(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        const updates = await this.fetchUpdates();
        for (const update of updates) {
          // Advance the offset before handling. Telegram treats a higher
          // offset as acknowledgement, and the gateway dedupes on update_id
          // anyway — so a message that fails to process is not redelivered
          // forever, blocking every message behind it.
          this.offset = Math.max(this.offset, update.update_id + 1);

          const payload = this.adapter.parseUpdate(update);
          if (!payload) continue;

          try {
            await this.gateway.handleTurn(payload);
          } catch (error) {
            if (error instanceof TurnNotRecordedError) {
              // The turn was never written down, so acknowledging it would
              // lose the claimant's message outright. Rewind so Telegram sends
              // it again, and stop this batch: whatever broke the write will
              // break the next one too, and the backoff is the right response.
              this.offset = update.update_id;
              this.logger.error(
                `Update ${update.update_id} could not be recorded; leaving it unacknowledged ` +
                  `for redelivery. ${(error as Error).message}`
              );
              await this.pause(TelegramPoller.ERROR_BACKOFF_MS);
              break;
            }
            // handleTurn records its own failure; this only stops one bad
            // message from ending the poll loop.
            this.logger.error(`Update ${update.update_id}: ${(error as Error).message}`);
          }
        }

        await this.reconcileStalledTurns();
      } catch (error) {
        const status = (error as { response?: { status?: number } })?.response?.status;

        // 409 and 401 are not transient, and logging them as "poll failed"
        // every five seconds forever tells nobody what is wrong. 409 is the
        // one status that *proves* the condition this module's own comment
        // warns about — a second poller, or a webhook still registered.
        if (status === 409) {
          this.logger.error(
            'Telegram returned 409 Conflict: another poller is running on this bot token, or a ' +
              'webhook is still set. Exactly one instance may poll — see TELEGRAM_POLLING_ENABLED. ' +
              'Claimants will appear to be intermittently ignored until this is resolved.'
          );
        } else if (status === 401) {
          // Retrying a revoked token forever is noise with no path to recovery.
          this.logger.error(
            'Telegram returned 401 Unauthorized: the bot token is invalid or has been revoked. ' +
              'Stopping the poller — restart the service once TELEGRAM_BOT_TOKEN is corrected.'
          );
          this.running = false;
          return;
        } else {
          this.logger.error(`Poll failed: ${(error as Error).message}`);
        }
        await this.pause(TelegramPoller.ERROR_BACKOFF_MS);
      }
    }
  }

  /**
   * Surface turns that were recorded and then never processed.
   *
   * The offset is advanced before handling, so a crash or a restart between
   * the insert and the reply leaves the row `PENDING` — and redelivery is
   * suppressed by the very dedupe index that makes retries safe. The
   * claimant's message then sits in the database, unanswered, with nothing
   * anywhere indicating it.
   *
   * Deliberately does **not** retry. Re-running a half-finished turn risks
   * repeating whatever part did complete, and the honest outcome is to make
   * the loss visible: the row is marked failed, an operator sees it in the
   * transcript, and the warning names how many. Runs here because the poller
   * is already the fleet-wide singleton, so it cannot double-sweep.
   */
  private async reconcileStalledTurns(): Promise<void> {
    if (Date.now() - this.lastReconcileAt < TelegramPoller.RECONCILE_INTERVAL_MS) return;
    this.lastReconcileAt = Date.now();

    try {
      const cutoff = new Date(Date.now() - TelegramPoller.STALLED_AFTER_MS);
      const stalled = await this.gateway.markStalledTurns(this.adapter.channel, cutoff);
      if (stalled > 0) {
        this.logger.error(
          `${stalled} inbound turn(s) were recorded but never processed — most likely a restart ` +
            'mid-turn. Marked failed so they are visible in the transcript rather than silent.'
        );
      }
    } catch (error) {
      this.logger.warn(`Could not reconcile stalled turns: ${(error as Error).message}`);
    }
  }

  private async fetchUpdates(): Promise<TelegramUpdate[]> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    const { data } = await firstValueFrom(
      this.http.get(`https://api.telegram.org/bot${token}/getUpdates`, {
        params: {
          offset: this.offset,
          timeout: TelegramPoller.LONG_POLL_SECONDS,
          allowed_updates: JSON.stringify(['message', 'callback_query']),
        },
        timeout: (TelegramPoller.LONG_POLL_SECONDS + 10) * 1000,
      })
    );
    return (data?.result as TelegramUpdate[]) ?? [];
  }

  private pause(ms: number): Promise<void> {
    return new Promise(resolve => {
      this.timer = setTimeout(resolve, ms);
    });
  }
}
