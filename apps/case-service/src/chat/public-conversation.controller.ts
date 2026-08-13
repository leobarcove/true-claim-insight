import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiExcludeController, ApiOperation } from '@nestjs/swagger';

import { InternalKeyGuard } from '../common/guards/internal-key.guard';
import { ClaimantConversationService } from './claimant-conversation.service';
import { ClaimantTurnDto } from './dto/claimant-turn.dto';

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
  constructor(private readonly service: ClaimantConversationService) {}

  @Post('start')
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 10, ttl: 10_000 } })
  @ApiOperation({ summary: 'Open the public intake conversation' })
  start(@Headers('x-web-session-id') sessionId: string, @Query('locale') locale?: string) {
    return this.service.start({ sessionId }, locale);
  }

  @Get()
  @ApiOperation({ summary: 'The visitor’s own transcript' })
  transcript(@Headers('x-web-session-id') sessionId: string) {
    return this.service.transcript({ sessionId });
  }

  @Post('turn')
  @Throttle({ short: { limit: 3, ttl: 1000 }, medium: { limit: 40, ttl: 10_000 } })
  @ApiOperation({ summary: 'Send one turn as an unidentified visitor' })
  async turn(@Headers('x-web-session-id') sessionId: string, @Body() dto: ClaimantTurnDto) {
    await this.service.handleTurn({ sessionId }, dto);
    return this.service.transcript({ sessionId });
  }

  /**
   * Attach evidence, then name it on a turn — the same two steps the
   * authenticated app takes, so the bytes never travel as part of the
   * conversation and the server checks the file belongs to this claim.
   */
  @Post('upload')
  @Throttle({ short: { limit: 2, ttl: 1000 }, medium: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Attach a document to the visitor’s open claim' })
  async upload(@Headers('x-web-session-id') sessionId: string, @Req() req: any) {
    const file = await req.file();
    if (!file) throw new BadRequestException('No file uploaded');
    return this.service.uploadDocument({ sessionId }, file);
  }
}
