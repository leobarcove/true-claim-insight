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
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
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
    @Req() request: FastifyRequest & { rawBody?: Buffer }
  ): Promise<{ received: true }> {
    if (!this.verifySignature(signature, request.rawBody)) {
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
        if (!value?.messages?.length) {
          // Named rather than dropped in silence. From outside, a
          // subscription delivering only `statuses` is indistinguishable
          // from one delivering nothing at all, and telling those apart is
          // most of the work of getting a WhatsApp channel live.
          //
          // Field names and payload keys carry no personal data; the values
          // under them would, so they stay out.
          // Status values — sent, delivered, read, failed — distinguish a
          // receipt for something we sent from an inbound message that
          // failed to parse. They name no one.
          const statuses = value?.statuses?.map(s => s.status ?? '?').join(',');
          this.logger.debug(
            `Delivery carried no messages (field=${change.field ?? 'unknown'}, ` +
              `keys=${Object.keys(value ?? {}).join('|') || 'none'}` +
              `${statuses ? `, statuses=${statuses}` : ''}).`
          );
          continue;
        }

        const contactWaId = value.contacts?.[0]?.wa_id;
        for (const message of value.messages) {
          const payload = this.adapter.parseMessage(message, contactWaId);
          if (!payload) continue;

          // The signature proves Meta sent this delivery. It says nothing
          // about who typed the message, and a live WhatsApp number is
          // reachable by anyone who has it.
          if (!this.isAllowedSender(payload.platformUserId)) {
            // Deliberately without the number: a phone number is personal
            // data, and NRIC was removed from these logs for the same reason.
            this.logger.warn('Ignored a WhatsApp message from a sender outside the allowlist.');
            continue;
          }

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
   * May this sender drive a conversation?
   *
   * `waId` is Meta's form of the sender's number — digits only, full country
   * code, no `+` (a Malaysian mobile arrives as `60123456789`).
   *
   * The channel goes live on a real number long before the platform is ready
   * for the public, and during the tunnel phase that number reaches a
   * developer's machine. §3.4 also restricts this channel to synthetic and
   * internal-tester data, which is a claim about *who messages it*, not only
   * about what we store.
   *
   * `WHATSAPP_ALLOWED_SENDERS` is a comma-separated list of numbers in any
   * readable form — `+60 12-345 6789`, `60123456789` — normalised to digits
   * before comparison, because the value is typed by a human into a `.env`.
   *
   * Two decisions, and they pull against each other.
   *
   * **The guard does not apply in production.** An allowlist in front of a
   * public intake channel excludes the very people it exists for — every real
   * claimant is a stranger. So it is a development control, and unset
   * `NODE_ENV` counts as production, the shape `OtpService.isProduction` uses:
   * guessing wrong that way blocks nobody, and guessing the other way would
   * silently gate real claimants on the day this launches.
   *
   * **An empty list denies everyone**, rather than waving everyone through.
   * The opposite reading gives a guard that does nothing until somebody
   * remembers to configure it, and they will not, because the channel works
   * perfectly without it. Failing closed is what `WHATSAPP_APP_SECRET` above
   * already chose for the same endpoint; the cost is an afternoon of "why is
   * the bot silent", paid once, and the error log below is aimed at exactly
   * that afternoon.
   */
  private isAllowedSender(waId: string): boolean {
    if ((process.env.NODE_ENV ?? 'production') === 'production') return true;

    const configured = this.config.get<string>('WHATSAPP_ALLOWED_SENDERS') ?? '';
    const allowlist = configured
      .split(',')
      .map(entry => entry.replace(/\D/g, ''))
      .filter(Boolean);
    const sender = waId.replace(/\D/g, '');

    if (!allowlist.length) {
      // Named loudly, because the symptom — a bot that receives nothing — is
      // indistinguishable from a webhook that was never subscribed.
      this.logger.error(
        `WHATSAPP_ALLOWED_SENDERS is empty and NODE_ENV is ${process.env.NODE_ENV}, ` +
          'so every inbound message is being dropped. Add the tester numbers to ' +
          'let the channel through.'
      );
      return false;
    }

    return allowlist.includes(sender);
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
  /**
   * HMAC-SHA256 over the bytes Meta sent — never over a re-serialised copy.
   *
   * This took a day of a claimant's intake to find, so it is worth stating
   * plainly. The check used to hash `JSON.stringify(body)`, the *parsed* body
   * put back into JSON by Node. Meta's backend is PHP, whose `json_encode`
   * escapes forward slashes: it sends `16\/06\/2026` where JSON.stringify
   * produces `16/06/2026`. Different bytes, different HMAC, delivery discarded.
   *
   * The damage was shaped by the data: messages with no slash ("Hi", a policy
   * number, a name) verified fine, so the channel looked alive. Every date did
   * not — and the flow asks for DD/MM/YYYY, so intake could never pass the
   * trip-date question. Nothing alarmed, because a rejected delivery still
   * answers 200 by design.
   *
   * Fails closed when `rawBody` is absent. If a future body-parser change stops
   * populating it, WhatsApp goes conspicuously dead rather than quietly
   * reverting to the bug above — a channel that dies loudly gets fixed, one
   * that drops one message in three does not.
   */
  private verifySignature(signature: string | undefined, rawBody: Buffer | undefined): boolean {
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!secret) {
      this.logger.error('WHATSAPP_APP_SECRET is not set; every delivery is being discarded.');
      return false;
    }
    if (!rawBody?.length) {
      this.logger.error(
        'Raw request body is unavailable, so no delivery can be verified. ' +
          'NestFactory.create needs `rawBody: true` (apps/case-service/src/main.ts).'
      );
      return false;
    }
    if (!signature?.startsWith('sha256=')) return false;

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const provided = signature.slice('sha256='.length);
    if (provided.length !== expected.length) return false;

    return timingSafeEqual(Buffer.from(provided, 'hex'), Buffer.from(expected, 'hex'));
  }
}

interface WhatsAppWebhookBody {
  entry?: Array<{
    changes?: Array<{
      /** `messages`, `statuses`, … — which subscription produced this. */
      field?: string;
      value?: {
        contacts?: Array<{ wa_id?: string }>;
        messages?: WhatsAppInboundMessage[];
        /** Receipts for messages we sent — sent, delivered, read, failed. */
        statuses?: Array<{ status?: string }>;
      };
    }>;
  }>;
}
