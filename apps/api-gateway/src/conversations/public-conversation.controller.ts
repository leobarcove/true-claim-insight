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
  private issueSession(): string {
    const id = randomUUID();
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
  private sessionIdFrom(token: string | undefined): string | null {
    if (!token) return null;
    const [id, signature] = token.split('.');
    if (!id || !signature) return null;

    const expected = this.sign(id);
    if (signature.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return id;
  }

  private headers(sessionId: string) {
    return { 'x-internal-key': this.internalKey, 'x-web-session-id': sessionId };
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
  @Post('start')
  @Public()
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Open or resume a public intake conversation' })
  async start(
    @Headers('x-web-session') token: string | undefined,
    @Query('locale') locale?: string
  ) {
    const existing = this.sessionIdFrom(token);
    const session = existing ? token! : this.issueSession();
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
