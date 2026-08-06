import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { ConversationGateway } from '../conversation.gateway';
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
    if (this.config.get('TELEGRAM_POLLING_ENABLED') === 'false') {
      this.logger.log('Telegram polling disabled by configuration.');
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
            // handleTurn records its own failure; this only stops one bad
            // message from ending the poll loop.
            this.logger.error(`Update ${update.update_id}: ${(error as Error).message}`);
          }
        }
      } catch (error) {
        this.logger.error(`Poll failed: ${(error as Error).message}`);
        await this.pause(TelegramPoller.ERROR_BACKOFF_MS);
      }
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
