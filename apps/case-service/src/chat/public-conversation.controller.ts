import {
  BadRequestException,
  Body,
  ForbiddenException,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CaseChannel } from '@prisma/client';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';

import { InternalKeyGuard } from '../common/guards/internal-key.guard';
import {
  ClaimantConversationService,
  type ConversationIdentity,
} from './claimant-conversation.service';
import { ClaimantTurnDto } from './dto/claimant-turn.dto';
import { TelegramAdapter } from './telegram/telegram.adapter';

/**
 * The intake conversation for someone who has not logged in.
 *
 * This is the web equivalent of messaging the WhatsApp number: a visitor opens
 * a link and starts talking, and the conversation itself works out who they
 * are. It is the same `ConversationGateway`, the same flow, the same
 * transcript — only the identity differs, and only until a code is proved.
 *
 * **No role guard, deliberately.** There is no claimant yet to have a role.
 * What stands in its place:
 *
 *  - `InternalKeyGuard` — only api-gateway may call this. Key only, because
 *    a visitor with no verified number has no identity to assert. The public surface
 *    is the gateway's edge route, which owns the session token and the
 *    per-IP limits. case-service is never publicly reachable.
 *  - the session id — an opaque value the gateway signs and this service only
 *    ever uses as a binding key. It grants nothing: a binding with no
 *    `claimantId` cannot see a claim, because every read is scoped by it.
 *  - the gateway's onboarding — nothing about any claim is said until a
 *    number has been proved with a code.
 *
 * Tighter throttles than the authenticated twin. That one is behind a login,
 * so the cost of abuse is an account; this one is open to the internet, and
 * each early turn can dispatch a WhatsApp message that costs real money.
 */
@ApiExcludeController()
@Controller({ path: 'public/conversation', version: '1' })
@UseGuards(InternalKeyGuard)
export class PublicConversationController {
  constructor(
    private readonly service: ClaimantConversationService,
    private readonly telegram: TelegramAdapter
  ) {}

  /**
   * Which conversation this request is for.
   *
   * Two ways in, and the difference is who vouched for the claimant:
   *
   *  - **a web session** — an opaque id the gateway signed. It names a thread
   *    and nothing more; the conversation itself proves a number before the
   *    thread is attached to anyone.
   *  - **a channel identity** — a claimant already bound on Telegram or
   *    WhatsApp, opening that channel's richer surface. The platform attested
   *    them and the gateway verified the attestation; here it resolves an
   *    existing binding and refuses to create one.
   *
   * Both arrive as internal headers set by api-gateway, which is the only
   * caller `InternalKeyGuard` admits. Neither is a value a claimant can set:
   * the public surface is the gateway's edge route, which owns the signed
   * token and does the verification.
   */
  /**
   * Which web channel a session belongs to.
   *
   * Only the two surfaces that reach this door are accepted. `x-web-channel` is
   * set by api-gateway from the signed session payload, but narrowing here as
   * well is deliberate: if that header ever became settable, the worst it could
   * do is move a visitor between two anonymous, code-gated web threads — not
   * open a WhatsApp or Telegram binding, which carry a platform's attestation
   * that this door has no way to check.
   */
  private webChannelFrom(header: string | undefined): CaseChannel | undefined {
    if (!header) return undefined;
    if (header === CaseChannel.WEB_FORM) return CaseChannel.WEB_FORM;
    if (header === CaseChannel.WEB_CHAT) return CaseChannel.WEB_CHAT;
    throw new BadRequestException(`Unknown web channel ${header}.`);
  }

  private identityFrom(
    sessionId: string | undefined,
    channel: string | undefined,
    platformUserId: string | undefined,
    webChannel?: string | undefined
  ): ConversationIdentity {
    if (channel && platformUserId?.trim()) {
      // Narrowed against the enum's *values*, not with `in`. `in` walks the
      // prototype chain, so `toString` and `constructor` passed as channels and
      // then reached Prisma as invalid enums — a 500 where a refusal belongs.
      // The header is internal and the gateway never sets those, which is
      // exactly why it would have gone unnoticed.
      if (!Object.values(CaseChannel).includes(channel as CaseChannel)) {
        throw new BadRequestException(`Unknown channel ${channel}.`);
      }
      return { channel: channel as CaseChannel, platformUserId };
    }
    return { sessionId: sessionId as string, webChannel: this.webChannelFrom(webChannel) };
  }

  /**
   * Exchange a Mini App launch for the conversation it belongs to.
   *
   * The claimant is already known — they have been talking to the bot, the
   * platform vouched for them, and a code proved their number. All this does is
   * establish that the browser now asking is genuinely that Telegram client,
   * and hand back the identity the gateway should scope a session to.
   *
   * Two refusals, and they are different failures:
   *
   *  - the signature does not verify, or is stale → nothing is attested, so
   *    there is nobody to be. 401.
   *  - it verifies, but no binding exists → a real Telegram user who has never
   *    messaged us. `bindingFor` refuses to invent one; opening the form is not
   *    a way to start a claim, because a conversation begun here would have
   *    skipped the consent notice the thread gives first.
   *
   * Returns no claim data of any kind. It names a conversation; reading it is a
   * separate, scoped request.
   */
  @Post('channel/telegram')
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Resolve a Telegram Mini App launch to its binding (internal)' })
  async telegramLaunch(@Body() body: { initData?: string }) {
    const platformUserId = this.telegram.verifyInitData(body?.initData ?? '');
    if (!platformUserId) {
      throw new UnauthorizedException('This form link could not be verified. Please reopen it from the chat.');
    }

    // Throws ForbiddenException when there is no binding — the honest answer,
    // and the one that tells the claimant what to do instead.
    const binding = await this.service.bindingFor({
      channel: CaseChannel.TELEGRAM,
      platformUserId,
    });

    // A binding with no claimant has not proved a number yet. The thread is
    // where that happens, and it must stay there: the onboarding steps that
    // ask for it also carry the privacy notice.
    if (!binding.claimantId) {
      throw new ForbiddenException('Please finish verifying your number in the chat first.');
    }

    return { channel: CaseChannel.TELEGRAM, platformUserId };
  }

  @Post('start')
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 10, ttl: 10_000 } })
  @ApiOperation({ summary: 'Open the public intake conversation' })
  start(
    @Headers('x-web-session-id') sessionId: string,
    @Headers('x-channel') channel: string,
    @Headers('x-channel-user-id') platformUserId: string,
    @Headers('x-web-channel') webChannel: string,
    @Query('locale') locale?: string
  ) {
    return this.service.start(this.identityFrom(sessionId, channel, platformUserId, webChannel), locale);
  }

  @Get()
  @ApiOperation({ summary: 'The visitor’s own transcript' })
  transcript(
    @Headers('x-web-session-id') sessionId: string,
    @Headers('x-channel') channel: string,
    @Headers('x-channel-user-id') platformUserId: string,
    @Headers('x-web-channel') webChannel: string
  ) {
    return this.service.transcript(this.identityFrom(sessionId, channel, platformUserId, webChannel));
  }

  /**
   * The whole picture at once, for a surface that shows more than one question.
   *
   * The transcript is enough for the chat, where the last bubble *is* the
   * state. A form needs the answers so far, the flow it is walking and which
   * stage it is at — the same pair a logged-in claimant gets from
   * `GET /cases/:id` and `GET /cases/:id/flow`, mirrored for a session that has
   * no case id and no login.
   *
   * Same throttle class as the transcript: it is a read of the caller's own
   * conversation and costs a database round trip, not a WhatsApp message.
   */
  @Get('state')
  @ApiOperation({ summary: 'Everything the form needs to render, for this session' })
  state(
    @Headers('x-web-session-id') sessionId: string,
    @Headers('x-channel') channel: string,
    @Headers('x-channel-user-id') platformUserId: string,
    @Headers('x-web-channel') webChannel: string
  ) {
    return this.service.state(this.identityFrom(sessionId, channel, platformUserId, webChannel));
  }

  @Post('turn')
  @Throttle({ short: { limit: 3, ttl: 1000 }, medium: { limit: 40, ttl: 10_000 } })
  @ApiOperation({ summary: 'Send one turn as an unidentified visitor' })
  async turn(
    @Headers('x-web-session-id') sessionId: string,
    @Headers('x-channel') channel: string,
    @Headers('x-channel-user-id') platformUserId: string,
    @Headers('x-web-channel') webChannel: string,
    @Body() dto: ClaimantTurnDto
  ) {
    const identity = this.identityFrom(sessionId, channel, platformUserId, webChannel);
    await this.service.handleTurn(identity, dto);
    return this.service.transcript(identity);
  }

  /**
   * Attach evidence, then name it on a turn — the same two steps the
   * authenticated app takes, so the bytes never travel as part of the
   * conversation and the server checks the file belongs to this claim.
   */
  @Post('upload')
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Attach a document to the visitor’s open claim' })
  async upload(
    @Headers('x-web-session-id') sessionId: string,
    @Headers('x-channel') channel: string,
    @Headers('x-channel-user-id') platformUserId: string,
    @Headers('x-web-channel') webChannel: string,
    @Req() req: any
  ) {
    const file = await req.file();
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.uploadDocument(
      this.identityFrom(sessionId, channel, platformUserId, webChannel),
      file
    );
  }
}
