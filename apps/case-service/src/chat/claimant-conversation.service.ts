import { Injectable, Logger } from '@nestjs/common';
import {
  CaseChannel,
  ConversationMode,
  MessageDirection,
} from '@prisma/client';

import { PrismaService } from '../config/prisma.service';
import { ConversationGateway } from './conversation.gateway';
import type { TenantContext } from '../common/guards/tenant.guard';

/**
 * The claimant's own side of a web-chat conversation.
 *
 * Deliberately thin. Everything that decides anything — which question comes
 * next, whether an answer is valid, when to fetch a human — is
 * `ConversationGateway`, exactly as it is for Telegram. This class does two
 * things the messaging channels get from their platform instead: it works out
 * which binding an authenticated browser session belongs to, and it hands back
 * the transcript, because a pull channel has no other way to hear the reply.
 */
@Injectable()
export class ClaimantConversationService {
  private readonly logger = new Logger(ClaimantConversationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ConversationGateway
  ) {}

  /**
   * The binding for this logged-in claimant, created on first use.
   *
   * `platformUserId` is the claimant's own id. On Telegram it is a chat id
   * belonging to an account we have to prove they control, which is what the
   * request_contact and OTP dance is for. Here they arrived with a session
   * token this platform issued, so the proof already happened at login and
   * repeating it would be theatre — `verifiedAt` is set from the outset and
   * the flow starts at the first real question rather than at "share your
   * number".
   *
   * One binding per claimant, guaranteed by the (channel, platformUserId)
   * unique constraint rather than by checking first: two tabs opened together
   * would otherwise both find nothing and both create one.
   */
  async bindingFor(tenantContext: TenantContext) {
    const claimantId = tenantContext.userId;

    return this.prisma.conversationBinding.upsert({
      where: {
        channel_platformUserId: {
          channel: CaseChannel.WEB_CHAT,
          platformUserId: claimantId,
        },
      },
      update: { lastSeenAt: new Date() },
      create: {
        channel: CaseChannel.WEB_CHAT,
        platformUserId: claimantId,
        claimantId,
        tenantId: tenantContext.tenantId,
        verifiedAt: new Date(),
        mode: ConversationMode.BOT,
        lastSeenAt: new Date(),
      },
    });
  }

  /**
   * Take one turn from the claimant.
   *
   * Returns nothing useful on purpose: the reply is whatever the gateway
   * persisted while handling it, and the caller reads the transcript. Making
   * this return "the bot's answer" would invent a request/response shape the
   * gateway does not have — a single turn can produce three messages, or none
   * at all when a human has taken over.
   */
  async handleTurn(
    tenantContext: TenantContext,
    turn: {
      clientMessageId: string;
      text?: string;
      callbackValue?: string;
      callbackStepId?: string;
      storedDocumentId?: string;
      locale?: string;
    }
  ) {
    const binding = await this.bindingFor(tenantContext);

    await this.gateway.handleTurn({
      channel: CaseChannel.WEB_CHAT,
      platformUserId: binding.platformUserId,
      // Namespaced by binding so one claimant's client-side counter can never
      // collide with another's. The gateway dedupes on this, and a collision
      // would silently drop a real answer as "already seen".
      platformMessageId: `${binding.id}:${turn.clientMessageId}`,
      text: turn.text,
      callbackValue: turn.callbackValue,
      callbackStepId: turn.callbackStepId,
      storedDocumentId: turn.storedDocumentId,
      locale: turn.locale,
      // A browser tab is inherently one-to-one; there is no group chat to
      // guard against, which is what this field exists to catch elsewhere.
      chatType: 'private',
    });

    return { accepted: true };
  }

  /**
   * The conversation as the claimant should see it.
   *
   * Outbound messages an operator sent are included — from the claimant's side
   * a reply from the firm is a reply from the firm, and hiding it would leave
   * them staring at an unanswered question a human had in fact answered. The
   * handover *reason* is not: that is an internal note about their claim.
   */
  async transcript(tenantContext: TenantContext) {
    const binding = await this.bindingFor(tenantContext);

    const messages = await this.prisma.conversationMessage.findMany({
      where: {
        bindingId: binding.id,
        // A turn we could not read is not part of the conversation the
        // claimant had — they saw our "please send that as a file" reply, and
        // showing the unreadable original back to them explains nothing.
        status: { not: 'FAILED' },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        direction: true,
        text: true,
        stepId: true,
        sentByUserId: true,
        createdAt: true,
      },
    });

    return {
      bindingId: binding.id,
      // So the PWA can say "a colleague is looking at this" rather than
      // leaving the claimant typing into a bot that has stood down.
      withAgent: binding.mode === ConversationMode.HANDOVER,
      caseId: binding.activeCaseId,
      messages: messages.map(message => ({
        id: message.id,
        direction: message.direction,
        text: message.text,
        stepId: message.stepId,
        /** True when a person wrote it, so the PWA can label it as such. */
        fromAgent: message.direction === MessageDirection.OUTBOUND && message.sentByUserId !== null,
        createdAt: message.createdAt,
      })),
    };
  }

  /**
   * Ask the bot to open the conversation.
   *
   * A messaging claimant says "hi" first; a claimant who has just tapped
   * "Start a claim" has already said it by arriving. Without this the PWA
   * would render an empty thread and wait for someone who is waiting for it.
   */
  async start(tenantContext: TenantContext, locale?: string) {
    const binding = await this.bindingFor(tenantContext);

    const alreadyTalking = await this.prisma.conversationMessage.count({
      where: { bindingId: binding.id, direction: MessageDirection.OUTBOUND },
    });
    if (alreadyTalking > 0) return this.transcript(tenantContext);

    await this.handleTurn(tenantContext, {
      clientMessageId: 'start',
      text: 'start',
      locale,
    });
    return this.transcript(tenantContext);
  }
}
