import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConversationMode, ConversationStatus } from '@prisma/client';
import { ConversationsService } from './conversations.service';
import {
  AddNoteDto,
  AssignConversationDto,
  ReplyDto,
  SetConversationStatusDto,
  TakeOverDto,
  UnbindConversationDto,
} from './dto/conversation.dto';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';

/**
 * Staff only, and deliberately no CLAIMANT. A claimant already has their own
 * side of the conversation on the channel itself; exposing this API to them
 * would hand over the transcript of an agent's handover reason and internal
 * notes about their own claim.
 *
 * SUPPORT_DESK is included: answering a claimant who asks for a human is
 * precisely their job. They cannot see claim decision data through this route —
 * the payload carries case number, status and type, no bank details or answers.
 */
const AGENT_ROLES = [
  UserRole.ADJUSTER,
  UserRole.FIRM_ADMIN,
  UserRole.SUPPORT_DESK,
  UserRole.SUPER_ADMIN,
] as const;

@ApiTags('conversations')
@ApiBearerAuth()
@Controller({ path: 'conversations', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class ConversationsController {
  constructor(private readonly service: ConversationsService) {}

  @Get()
  @Roles(...AGENT_ROLES)
  @ApiOperation({ summary: 'Conversations for this tenant, most recent first' })
  list(@Tenant() tenantContext: TenantContext, @Query('mode') mode?: ConversationMode) {
    return this.service.list(tenantContext, mode ? { mode } : undefined);
  }

  @Get('agents')
  @Roles(...AGENT_ROLES)
  @ApiOperation({ summary: 'Colleagues a conversation can be handed to' })
  agents(@Tenant() tenantContext: TenantContext) {
    return this.service.assignableAgents(tenantContext);
  }

  @Get(':id')
  @Roles(...AGENT_ROLES)
  @ApiOperation({
    summary: 'Full transcript, oldest first',
    description:
      'An outbound message with sentByUserId null was sent by the bot; a value means an ' +
      'agent typed it. That distinction is what makes bot performance reviewable.',
  })
  transcript(@Param('id', ParseUUIDPipe) id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.transcript(id, tenantContext);
  }

  @Post(':id/take-over')
  @Roles(...AGENT_ROLES)
  @ApiOperation({
    summary: 'Take the conversation; the bot stands down until it is handed back',
  })
  takeOver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TakeOverDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.takeOver(id, dto.reason, tenantContext);
  }

  @Post(':id/reply')
  @Roles(...AGENT_ROLES)
  @ApiOperation({ summary: 'Send a message to the claimant as the firm' })
  reply(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.reply(id, dto.text, tenantContext);
  }

  /**
   * Revoke a binding. Firm admins only: this severs a claimant's link to their
   * own conversation, which is a heavier act than taking a thread over.
   */
  @Post(':id/unbind')
  @Roles(UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Break the link between this chat and the claimant' })
  unbind(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UnbindConversationDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.unbind(id, dto.reason, tenantContext);
  }

  @Post(':id/resolve')
  @Roles(...AGENT_ROLES)
  @ApiOperation({ summary: 'Hand back to the bot; the flow resumes at the pinned step' })
  resolve(@Param('id', ParseUUIDPipe) id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.resolve(id, tenantContext);
  }

  @Post(':id/assign')
  @Roles(...AGENT_ROLES)
  @ApiOperation({ summary: 'Hand the conversation to a colleague, or release it' })
  assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignConversationDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.assign(id, body.assigneeId ?? null, tenantContext);
  }

  @Post(':id/status')
  @Roles(...AGENT_ROLES)
  @ApiOperation({ summary: 'Move the conversation through the queue' })
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SetConversationStatusDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.setStatus(
      id,
      body.status as ConversationStatus,
      body.snoozedUntil ? new Date(body.snoozedUntil) : null,
      tenantContext
    );
  }

  @Post(':id/notes')
  @Roles(...AGENT_ROLES)
  @ApiOperation({ summary: 'Leave a note for colleagues; never sent to the claimant' })
  addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddNoteDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.addNote(id, body.text, tenantContext);
  }
}
