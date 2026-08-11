import { createHmac, timingSafeEqual } from 'crypto';
import {
  Body,
  Controller,
  VERSION_NEUTRAL,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';

import { NoEnvelope } from '../../common/decorators/no-envelope.decorator';
import { ConversationGateway } from '../conversation.gateway';
import { WhatsAppAdapter, type WhatsAppInboundMessage } from './whatsapp.adapter';

/**
 * Meta's inbound webhook.
 *
 * The structural difference from Telegram: WhatsApp *pushes*. There is no
 * poller, no offset to advance, and no singleton constraint — every instance
 * behind the load balancer may receive updates, and the gateway's insert-first
 * dedupe on `platformMessageId` is what makes that safe rather than a source
 * of doubled answers.
 *
 * That also removes the footgun the Telegram integration carries: two pollers
 * each take half the updates and the symptom is claimants being intermittently
 * ignored. Nothing here can be misconfigured that way.
 *
 * Public by necessity — Meta is unauthenticated to us — so the signature is
 * the only thing standing between this endpoint and anyone who can POST JSON.
 */
@ApiExcludeController()
/**
 * Deliberately version-neutral, so the path is `/api/webhooks/whatsapp` and
 * not `/api/v1/...`. The URL lives in Meta's console, not in our repo:
 * bumping an internal API version must not silently stop a third party
 * reaching us, and repointing it is a manual step in someone else's dashboard.
 */
@Controller({ path: 'webhooks/whatsapp', version: VERSION_NEUTRAL })
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(
    private readonly gateway: ConversationGateway,
    private readonly adapter: WhatsAppAdapter,
    private readonly config: ConfigService
  ) {}

  /**
   * Meta's one-time verification handshake when the webhook URL is saved.
   *
   * It echoes a challenge back if the verify token matches. Failing this is
   * the commonest reason a WhatsApp integration appears to do nothing at all —
   * the subscription is never created, so no message is ever delivered.
   */
  @Get()
  @NoEnvelope()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string
  ): string {
    const expected = this.config.get<string>('WHATSAPP_WEBHOOK_VERIFY_TOKEN');

    if (!expected) {
      this.logger.error('WHATSAPP_WEBHOOK_VERIFY_TOKEN is not set; refusing to verify.');
      throw new ForbiddenException();
    }
    if (mode !== 'subscribe' || token !== expected) {
      this.logger.warn('Rejected a webhook verification with a wrong token.');
      throw new ForbiddenException();
    }

    this.logger.log('WhatsApp webhook verified.');
    return challenge;
  }

  /**
   * One webhook delivery, carrying zero or more messages.
   *
   * Always answers 200, even when handling fails. Meta retries a non-200 for
   * up to seven days with growing backoff, and a payload that will never
   * succeed — an unparseable message, a claimant we cannot resolve — would be
   * redelivered for a week while every later message queued behind it. The
   * turn is recorded before it is handled, so a failure is visible in the
   * transcript rather than lost with the retry.
   */
  @Post()
  @HttpCode(200)
  async receive(
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: WhatsAppWebhookBody,
    @Headers('x-tci-raw-body') _raw?: string
  ): Promise<{ received: true }> {
    if (!this.verifySignature(signature, body)) {
      // Not a 403: an attacker learns nothing from a 200, and Meta never sees
      // this branch because Meta always signs.
      this.logger.warn('Discarded a webhook delivery with a bad or missing signature.');
      return { received: true };
    }

    for (const entry of body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        // Status callbacks — sent, delivered, read — arrive on the same
        // webhook and outnumber real messages several times over.
        if (!value?.messages?.length) continue;

        const contactWaId = value.contacts?.[0]?.wa_id;
        for (const message of value.messages) {
          const payload = this.adapter.parseMessage(message, contactWaId);
          if (!payload) continue;

          try {
            await this.gateway.handleTurn(payload);
          } catch (error) {
            // Swallowed deliberately, and loudly. One bad message must not
            // cost the whole delivery, because the others in it are unrelated
            // claimants.
            this.logger.error(
              `Failed to handle WhatsApp message ${message.id}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }
    }

    return { received: true };
  }

  /**
   * Meta signs every delivery with HMAC-SHA256 over the raw body.
   *
   * Verified against the app secret, in constant time. Without this the
   * endpoint accepts any JSON from anyone — and the payload names a claimant's
   * phone number, so forging one would let a stranger drive somebody else's
   * intake conversation.
   *
   * Re-serialising the parsed body is a known weakness: Node's JSON output has
   * to match Meta's byte for byte, which holds for their payloads but is not
   * guaranteed. A raw-body middleware is the durable fix and is the reason
   * this returns false rather than throwing when the secret is absent —
   * failing closed keeps an unverifiable deployment inert instead of open.
   */
  private verifySignature(signature: string | undefined, body: unknown): boolean {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!secret) {
      this.logger.error('WHATSAPP_APP_SECRET is not set; every delivery is being discarded.');
      return false;
    }
    if (!signature?.startsWith('sha256=')) return false;

    const expected = createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
    const provided = signature.slice('sha256='.length);
    if (provided.length !== expected.length) return false;

    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  }
}

interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id?: string }>;
        messages?: WhatsAppInboundMessage[];
      };
    }>;
  }>;
}
