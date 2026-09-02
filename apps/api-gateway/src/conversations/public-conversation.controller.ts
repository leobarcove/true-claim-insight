import { randomUUID, createHmac, timingSafeEqual } from 'crypto';
import { HttpService } from '@nestjs/axios';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { firstValueFrom, type Observable } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

import { Public } from '../auth/decorators/public.decorator';
import { unwrapEnvelope } from '../common/unwrap-envelope';

/**
 * Intake for someone who has not logged in — the web equivalent of messaging
 * the WhatsApp number.
 *
 * A visitor opens a link and starts talking. There is no account, no password
 * and no login screen; the conversation asks for a mobile number and proves it
 * with a code, which is the same point at which a WhatsApp binding resolves.
 *
 * **The session token is not authentication.** It names a conversation and
 * nothing else. Holding one lets you continue *your* thread across page loads;
 * it grants no access to any claim, because the binding behind it carries no
 * claimant until a code has been verified, and every claim read is scoped by
 * that claimant. Signed only so a visitor cannot type someone else's session
 * id and read their thread.
 */
/**
 * Marks a session as naming a Telegram binding rather than a web thread.
 * Signed as part of the payload, so it cannot be added to a token after issue.
 */
const TELEGRAM_SESSION_PREFIX = 'tg:';

/**
 * Marks a session as belonging to the web *form* rather than the web chat.
 *
 * Same trick as the Telegram prefix and for the same reason: it is inside the
 * signed payload, so a visitor cannot add it, remove it, or move their chat
 * thread onto the form by editing a token. The two surfaces are separate
 * channels — a visitor who starts on the form and opens the chat gets a fresh
 * conversation and a fresh claim request (WEB_FORM_MICROSITE_PLAN D1) — and
 * this prefix is the only thing that tells them apart, because both are an
 * anonymous browser on the same origin.
 *
 * Not a security boundary: both surfaces are public and both prove a number
 * with a code, so nothing is gained by forging one. It is a routing fact, kept
 * unforgeable because a claimant landing in the wrong thread is a support call.
 */
const WEB_FORM_SESSION_PREFIX = 'wf:';

/**
 * How long a Mini App session stays usable. Twelve hours covers a claim
 * gathered across a day with interruptions; anything longer is a bearer token
 * outliving the sitting that produced it.
 */
const CHANNEL_SESSION_TTL_SECONDS = 12 * 60 * 60;
const CHANNEL_SESSION_SKEW_SECONDS = 60;

@ApiTags('Public intake')
@Controller('public/conversation')
export class PublicConversationProxyController {
  private readonly caseServiceUrl: string;
  private readonly internalKey: string;
  private readonly secret: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.caseServiceUrl = this.configService.get('CASE_SERVICE_URL') || 'http://localhost:3001';
    this.internalKey = this.configService.get('INTERNAL_API_KEY') || '';
    this.secret = this.configService.get('jwt.secret') || '';
  }

  /**
   * `<uuid>.<hmac>` — enough to be unguessable and self-verifying, with no
   * server-side session store to expire or replicate. A JWT would carry claims
   * this has no use for; the only claim is "this is a conversation id".
   */
  private issueSession(surface: 'chat' | 'form' = 'chat'): string {
    const id = surface === 'form' ? `${WEB_FORM_SESSION_PREFIX}${randomUUID()}` : randomUUID();
    return `${id}.${this.sign(id)}`;
  }

  private sign(id: string): string {
    return createHmac('sha256', this.secret).update(id).digest('hex');
  }

  /**
   * Returns the conversation id, or null if the token is absent or forged.
   *
   * Constant-time comparison: this is a value an attacker supplies and can
   * iterate on, so a leaky compare would let them recover a valid signature
   * byte by byte and read another visitor's thread.
   */
  private sessionIdFrom(token: string | undefined, now: Date = new Date()): string | null {
    if (!token) return null;
    const [id, signature] = token.split('.');
    if (!id || !signature) return null;

    const expected = this.sign(id);
    if (signature.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return null;

    // A channel session ages out; a visitor session does not, and the
    // difference is what each one is worth. A visitor token names a thread
    // attached to nobody until a code is proved, so a stale one grants what it
    // always granted: an empty conversation. A channel token names a binding
    // that already has a claimant, a case and payout details behind it, and a
    // bearer value like that should not sit in localStorage for ever.
    //
    // Nearly free to the claimant, because every Mini App launch mints a fresh
    // one from `initData` — this only bites a window left open overnight, and
    // the recovery is reopening it from the thread.
    if (id.startsWith(TELEGRAM_SESSION_PREFIX)) {
      const issuedAt = Number(id.split(':')[2]);
      if (!Number.isFinite(issuedAt)) return null;
      const ageSeconds = now.getTime() / 1000 - issuedAt;
      if (ageSeconds < -CHANNEL_SESSION_SKEW_SECONDS || ageSeconds > CHANNEL_SESSION_TTL_SECONDS) {
        return null;
      }
    }
    return id;
  }

  /**
   * A session for a claimant already bound on a messaging channel.
   *
   * Same envelope as a visitor session and a different meaning inside it. A
   * visitor's payload is a fresh uuid that names a thread nobody owns yet; this
   * one names a binding that already exists, on a channel where the platform
   * vouched for the person and a code proved their number.
   *
   * That is why it is only ever minted after an attestation has been verified
   * downstream, and never from a value the browser supplied on its own.
   */
  private issueChannelSession(platformUserId: string, now: Date = new Date()): string {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const payload = `${TELEGRAM_SESSION_PREFIX}${platformUserId}:${issuedAt}`;
    return `${payload}.${this.sign(payload)}`;
  }

  /**
   * Turn a verified payload into the internal headers case-service reads.
   *
   * The two shapes route to different identities there — a web session upserts
   * a WEB_CHAT binding, a channel identity resolves an existing one — so this
   * is the single place the distinction is made, rather than at each of the
   * four call sites where one of them would eventually be forgotten.
   */
  private headers(payload: string) {
    const base = { 'x-internal-key': this.internalKey };
    if (payload.startsWith(TELEGRAM_SESSION_PREFIX)) {
      return {
        ...base,
        'x-channel': 'TELEGRAM',
        // `tg:<platformUserId>:<issuedAt>` — the id is the middle segment, and
        // the timestamp is inside the signed payload rather than beside it so
        // it cannot be extended by editing the token.
        'x-channel-user-id': payload.split(':')[1],
      };
    }
    // A form session names a WEB_FORM binding; anything else is web chat. The
    // channel is derived from the verified payload, never from a header the
    // browser sent, so the two threads cannot be crossed by editing a request.
    if (payload.startsWith(WEB_FORM_SESSION_PREFIX)) {
      return { ...base, 'x-web-session-id': payload, 'x-web-channel': 'WEB_FORM' };
    }
    return { ...base, 'x-web-session-id': payload };
  }

  /**
   * Preserve the downstream status rather than collapsing it to a 500.
   *
   * case-service answers 403 for "verify your number first" and 400 for "no
   * claim open yet" — both are things the claimant needs told. Letting the
   * axios rejection fall through turned every one of them into an opaque
   * internal error.
   */
  private pass<T>(request: Observable<T>) {
    return firstValueFrom(
      request.pipe(
        map((response: any) => unwrapEnvelope(response.data)),
        catchError((error: any) => {
          throw new HttpException(
            error.response?.data ?? 'Upstream request failed',
            error.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR
          );
        })
      )
    );
  }

  private base(path = ''): string {
    return `${this.caseServiceUrl}/api/v1/public/conversation${path}`;
  }

  /**
   * Open a conversation, issuing a session when the caller has none.
   *
   * The token comes back in the body rather than a cookie: the PWA may be
   * served from a different origin to the API in development, and a token the
   * client stores explicitly is one it can also discard explicitly — "start
   * again" is then a client-side action rather than a server round trip.
   */
  /**
   * Open the Mini App: prove the launch is genuine, get a session for it.
   *
   * The claimant tapped a button inside Telegram, which opened our page and
   * handed it `initData` — launch parameters Telegram signed with a key derived
   * from the bot token. Verifying that signature is what makes this endpoint
   * safe to leave public: the browser cannot forge one, so an attacker cannot
   * name a Telegram user they are not.
   *
   * The verification itself happens in case-service, which owns the bot token.
   * Splitting it that way keeps two secrets in two places — the bot token never
   * reaches the edge, and the session-signing key never leaves it.
   */
  @Post('telegram/session')
  @Public()
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Exchange a Telegram Mini App launch for a session' })
  async telegramSession(@Body() body: { initData?: string }) {
    const resolved = (await this.pass(
      this.httpService.post(
        this.base('/channel/telegram'),
        { initData: body?.initData ?? '' },
        { headers: { 'x-internal-key': this.internalKey } }
      )
    )) as { platformUserId: string };

    // Nothing about the claim comes back here, deliberately — only the key to
    // ask for it. The transcript is a separate, scoped request, so a bug in
    // this route cannot leak a conversation.
    return { session: this.issueChannelSession(String(resolved.platformUserId)) };
  }

  @Post('start')
  @Public()
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Open or resume a public intake conversation' })
  async start(
    @Headers('x-web-session') token: string | undefined,
    @Query('locale') locale?: string,
    @Query('surface') surface?: string
  ) {
    const existing = this.sessionIdFrom(token);
    // `surface` decides only which channel a *new* conversation opens on. An
    // existing token keeps whatever it was issued as, so a form session cannot
    // be walked onto the chat channel by calling start again with a different
    // query string.
    const session = existing ? token! : this.issueSession(surface === 'form' ? 'form' : 'chat');
    const sessionId = existing ?? session.split('.')[0];

    const conversation = await this.pass(
      this.httpService.post(this.base('/start'), {}, {
        headers: this.headers(sessionId),
        params: { locale },
      })
    );

    return { session, conversation };
  }

  @Get()
  @Public()
  @ApiOperation({ summary: 'The visitor’s own transcript' })
  async transcript(@Headers('x-web-session') token: string | undefined) {
    const sessionId = this.sessionIdFrom(token);
    // No session means no conversation to show. Empty rather than an error:
    // a cleared browser is an ordinary state, not a failure.
    if (!sessionId) return { bindingId: null, withAgent: false, currentStep: null, messages: [] };

    return this.pass(
      this.httpService
        .get(this.base(), { headers: this.headers(sessionId) })
      );
  }

  /**
   * Everything the form needs to draw itself, in one read.
   *
   * The chat renders from the transcript, because one question at a time means
   * the last bubble is the state. A form shows a section at once and needs the
   * answers, the flow and which stage it is at.
   *
   * A missing session answers `phone` rather than erroring: an unopened or
   * cleared browser is the ordinary first visit, and the first screen it should
   * draw is the one asking for a number.
   */
  @Get('state')
  @Public()
  @ApiOperation({ summary: 'Everything the form needs to render, for this session' })
  async state(@Headers('x-web-session') token: string | undefined) {
    const sessionId = this.sessionIdFrom(token);
    if (!sessionId) return { stage: 'phone', locale: 'en', lastReply: null };

    return this.pass(
      this.httpService.get(this.base('/state'), { headers: this.headers(sessionId) })
    );
  }

  /**
   * Rate limited, but at human pace.
   *
   * Early turns dispatch a WhatsApp template message per verification attempt,
   * billed per send, so an open endpoint that sends messages is a toll-fraud
   * target. The first cut of this allowed 20 turns a minute — which throttled
   * a *claimant*: sixteen questions with a couple of validation retries passes
   * twenty comfortably, and they met a 429 mid-claim.
   *
   * The money is not actually defended here. It is defended where it is spent:
   * the per-phone limit in OtpService, and MAX_CODE_ATTEMPTS burning the
   * pending number on the binding. This limit exists to stop a flood, so it
   * matches the authenticated route rather than inventing a stricter number
   * that only real people notice.
   */
  @Post('turn')
  @Public()
  @Throttle({ short: { limit: 3, ttl: 1000 }, medium: { limit: 40, ttl: 10_000 } })
  @ApiOperation({ summary: 'Send one turn as an unidentified visitor' })
  async turn(@Headers('x-web-session') token: string | undefined, @Body() body: any) {
    const sessionId = this.sessionIdFrom(token);
    if (!sessionId) {
      // Refuse rather than mint one here: a turn with no conversation to apply
      // it to would silently open a thread and drop the message into it.
      return { bindingId: null, withAgent: false, currentStep: null, messages: [] };
    }

    return this.pass(
      this.httpService
        .post(this.base('/turn'), body, { headers: this.headers(sessionId) })
      );
  }

  /**
   * Evidence upload for a visitor, streamed straight through.
   *
   * `req.raw` rather than a parsed body, exactly as the authenticated case
   * upload does: re-encoding multipart at the edge would rewrite boundaries
   * and corrupt the file for no gain.
   */
  @Post('upload')
  @Public()
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Attach a document to the visitor’s open claim' })
  async upload(@Headers('x-web-session') token: string | undefined, @Req() req: any) {
    const sessionId = this.sessionIdFrom(token);
    if (!sessionId) throw new ForbiddenException('No conversation to attach this to.');

    return this.pass(
      this.httpService
        .post(this.base('/upload'), req.raw, {
          headers: { ...this.headers(sessionId), 'Content-Type': req.headers['content-type'] },
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
        })
      );
  }
}
