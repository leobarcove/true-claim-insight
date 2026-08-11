import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClaimantConversationService } from './claimant-conversation.service';
import { ClaimantTurnDto } from './dto/claimant-turn.dto';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';

/**
 * The claimant's own conversation, in the PWA.
 *
 * CLAIMANT only, and no staff role — the mirror of `ConversationsController`,
 * which is staff only and no claimant. They are two views of the same thread
 * and deliberately not the same endpoint: the operator payload carries the
 * handover reason, the assigned agent and internal case state, none of which
 * is the claimant's to read about their own claim.
 *
 * Everything here is scoped to the caller's own binding, resolved from the
 * token. No route takes a binding id, so there is nothing to enumerate.
 */
@ApiTags('claimant-conversation')
@ApiBearerAuth()
@Controller({ path: 'conversation', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class ClaimantConversationController {
  constructor(private readonly service: ClaimantConversationService) {}

  /**
   * Open the conversation, or return the one already in progress.
   *
   * Idempotent: a claimant who reloads mid-claim gets their thread back rather
   * than a second greeting on top of it.
   */
  @Post('start')
  @Roles(UserRole.CLAIMANT)
  @Throttle({ short: { limit: 3, ttl: 1000 } })
  @ApiOperation({ summary: 'Start or resume the claimant’s intake conversation' })
  start(@Tenant() tenantContext: TenantContext, @Query('locale') locale?: string) {
    return this.service.start(tenantContext, locale);
  }

  /**
   * Everything said so far, in order.
   *
   * Polled by the PWA. Kept cheap deliberately — no joins beyond the messages
   * themselves — because it is the one request that repeats for as long as a
   * claimant has the page open.
   */
  @Get()
  @Roles(UserRole.CLAIMANT)
  @ApiOperation({ summary: 'The claimant’s own transcript' })
  transcript(@Tenant() tenantContext: TenantContext) {
    return this.service.transcript(tenantContext);
  }

  /**
   * One turn from the claimant.
   *
   * Rate limited tighter than the general tiers. A claim conversation is a
   * person typing: ten turns a second is a loop or a script, and each one
   * costs a flow evaluation, a write and possibly a paid normalisation call.
   * The limit is generous for anyone real and useless to anything else.
   *
   * Named throttlers only — `short` and `medium` exist in this service's
   * config. A `@Throttle` naming one that does not is silently a no-op, which
   * is how five gateway routes went unprotected for months.
   */
  @Post('turn')
  @Roles(UserRole.CLAIMANT)
  @Throttle({ short: { limit: 5, ttl: 1000 }, medium: { limit: 40, ttl: 10_000 } })
  @ApiOperation({ summary: 'Send one message, tap or document as the claimant' })
  async turn(@Tenant() tenantContext: TenantContext, @Body() dto: ClaimantTurnDto) {
    await this.service.handleTurn(tenantContext, dto);
    // The reply is whatever the gateway just persisted, so the caller gets the
    // thread back rather than having to poll immediately for it.
    return this.service.transcript(tenantContext);
  }
}
