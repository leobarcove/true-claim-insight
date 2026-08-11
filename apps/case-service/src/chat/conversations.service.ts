import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConversationMessageStatus, ConversationMode, MessageDirection } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import type { TenantContext } from '../common/guards/tenant.guard';
import { ConversationGateway } from './conversation.gateway';

/**
 * The operator-facing side of conversational intake: read the transcript, take
 * a conversation over, reply as the firm, hand it back.
 *
 * Built here rather than integrated with an external CRM for two reasons that
 * are specific to this system. An agent needs the Case, its evidence checklist
 * and its deadline flags *beside* the conversation, and no generic inbox knows
 * what those are. And a third-party CRM would put claim content offshore — a
 * materially larger cross-border transfer than the message text Telegram
 * already sees, against a §3.4 position that is PARTIAL with no basis
 * established.
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ConversationGateway,
    private readonly auditService: AuditService
  ) {}

  /**
   * Conversations this operator's tenant may see.
   *
   * Bindings carry a tenantId once the claimant is verified; an unverified
   * binding has none and is deliberately invisible here. Nobody in a firm needs
   * to read a stranger's half-finished identity check, and showing it would
   * leak a phone number across tenants.
   */
  async list(tenantContext: TenantContext, filter?: { mode?: ConversationMode }) {
    const bindings = await this.prisma.conversationBinding.findMany({
      where: {
        tenantId: tenantContext.tenantId,
        verifiedAt: { not: null },
        ...(filter?.mode ? { mode: filter.mode } : {}),
      },
      orderBy: { lastSeenAt: 'desc' },
      include: {
        claimant: { select: { id: true, fullName: true, phoneNumber: true } },
        activeCase: {
          select: { id: true, caseNumber: true, status: true, travelClaimType: true },
        },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { text: true, direction: true, createdAt: true, sentByUserId: true },
        },
      },
    });

    // Counted rather than inferred from the last message: a claimant who sends
    // three messages while nobody is watching should read as three waiting, not
    // as one conversation with an inbound tail.
    const waitingCounts = await this.prisma.conversationMessage.groupBy({
      by: ['bindingId'],
      where: {
        bindingId: { in: bindings.map(b => b.id) },
        direction: MessageDirection.INBOUND,
        status: ConversationMessageStatus.AWAITING_AGENT,
      },
      _count: { _all: true },
    });
    const waiting = new Map(waitingCounts.map(row => [row.bindingId, row._count._all]));

    return bindings.map(binding => ({
      id: binding.id,
      channel: binding.channel,
      mode: binding.mode,
      assignedUserId: binding.assignedUserId,
      handoverAt: binding.handoverAt,
      handoverReason: binding.handoverReason,
      lastSeenAt: binding.lastSeenAt,
      claimant: binding.claimant,
      case: binding.activeCase,
      lastMessage: binding.messages[0] ?? null,
      awaitingAgent: waiting.get(binding.id) ?? 0,
    }));
  }

  /** The full transcript, oldest first — the order an operator reads it in. */
  async transcript(id: string, tenantContext: TenantContext) {
    const binding = await this.getBinding(id, tenantContext);

    const messages = await this.prisma.conversationMessage.findMany({
      where: { bindingId: binding.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        direction: true,
        text: true,
        // What the flow received, beside what the claimant saw. An operator
        // reconciling a disputed answer needs the value, not only the label.
        callbackValue: true,
        mediaRef: true,
        caseDocumentId: true,
        stepId: true,
        sentByUserId: true,
        status: true,
        error: true,
        createdAt: true,
      },
    });

    // The case each attachment belongs to, so an operator can open it. Read
    // from the document rather than from the binding's *current* case: a
    // claimant who files a second claim would otherwise have their earlier
    // photos addressed against the new one, and 404.
    const documentIds = messages.map(m => m.caseDocumentId).filter((v): v is string => Boolean(v));
    const documents = documentIds.length
      ? await this.prisma.caseDocument.findMany({
          where: { id: { in: documentIds } },
          select: { id: true, caseId: true, fileName: true, mimeType: true, documentType: true },
        })
      : [];
    const byId = new Map(documents.map(document => [document.id, document]));

    const withAttachments = messages.map(message => ({
      ...message,
      attachment: message.caseDocumentId ? (byId.get(message.caseDocumentId) ?? null) : null,
    }));

    return {
      id: binding.id,
      channel: binding.channel,
      mode: binding.mode,
      assignedUserId: binding.assignedUserId,
      handoverAt: binding.handoverAt,
      handoverReason: binding.handoverReason,
      resolvedAt: binding.resolvedAt,
      claimant: binding.claimant,
      case: binding.activeCase,
      // `sentByUserId === null` on an outbound row means the bot said it. That
      // is the distinction the whole screen exists to show.
      messages: withAttachments,
    };
  }

  /**
   * Take the conversation. The bot stands down immediately.
   *
   * `reason` is required, and is the field that makes bot performance
   * reviewable: a column of "bot did not understand the date format" is a
   * backlog, whereas a count of handovers is only a number.
   */
  async takeOver(id: string, reason: string, tenantContext: TenantContext) {
    const binding = await this.getBinding(id, tenantContext);

    // Only refuse when somebody else genuinely holds it. An *unassigned*
    // handover is the common case, not a conflict: the bot hands over on its
    // own when a claimant types "human" or asks to change a detail at the
    // review, and those paths set no assignee. Comparing a null assignee
    // against a user id made `null !== userId` true, so every agent was told
    // "another agent already has this" about a conversation nobody had — the
    // escape hatch filled a queue that could not be emptied.
    const heldBySomeoneElse =
      binding.mode === ConversationMode.HANDOVER &&
      binding.assignedUserId !== null &&
      binding.assignedUserId !== tenantContext.userId;

    if (heldBySomeoneElse) {
      throw new BadRequestException(
        'Another agent already has this conversation. Ask them to hand it back first.'
      );
    }

    const updated = await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: {
        mode: ConversationMode.HANDOVER,
        assignedUserId: tenantContext.userId,
        handoverAt: new Date(),
        handoverReason: reason,
        resolvedAt: null,
      },
    });

    await this.audit(binding.id, 'CONVERSATION_TAKEN_OVER', tenantContext, {
      newValues: { reason, assignedUserId: tenantContext.userId },
    });
    return updated;
  }

  /** Send a message as the firm. Only the agent holding the conversation may. */
  async reply(id: string, text: string, tenantContext: TenantContext) {
    const binding = await this.getBinding(id, tenantContext);

    if (binding.mode !== ConversationMode.HANDOVER) {
      throw new BadRequestException(
        'Take the conversation over before replying, so the bot stops answering.'
      );
    }
    if (binding.assignedUserId && binding.assignedUserId !== tenantContext.userId) {
      throw new ForbiddenException('This conversation is assigned to another agent.');
    }

    await this.gateway.sendAsOperator(
      binding.id,
      binding.channel,
      binding.platformUserId,
      text,
      tenantContext.userId
    );

    // Everything the claimant was waiting on has now been answered by a human.
    await this.prisma.conversationMessage.updateMany({
      where: {
        bindingId: binding.id,
        status: ConversationMessageStatus.AWAITING_AGENT,
      },
      data: { status: ConversationMessageStatus.PROCESSED, processedAt: new Date() },
    });

    // An agent speaking to a claimant on the firm's behalf is a claims-handling
    // act. The message body is deliberately not copied into the audit row — it
    // is already in the transcript, and duplicating claimant-facing text into a
    // second store widens the retention surface for no gain.
    await this.audit(binding.id, 'CONVERSATION_AGENT_REPLIED', tenantContext, {
      metadata: { characters: text.length },
    });
  }

  /**
   * Hand back to the bot. The flow resumes at the step the Case is pinned to,
   * because nothing about the conversation moved it — the bot was silent, not
   * lost.
   */
  async resolve(id: string, tenantContext: TenantContext) {
    const binding = await this.getBinding(id, tenantContext);

    // Handing a conversation back restarts the bot, so an agent doing it to
    // somebody else's live exchange puts the machine mid-sentence between an
    // agent and a claimant. Whoever holds it may hand it back; an unassigned
    // one is anybody's; and a firm admin can always clear a conversation whose
    // agent has gone home, because the alternative is a thread nobody can free.
    const heldBySomeoneElse =
      binding.assignedUserId !== null && binding.assignedUserId !== tenantContext.userId;
    const isAdmin = tenantContext.userRole === 'FIRM_ADMIN' || tenantContext.userRole === 'SUPER_ADMIN';

    if (heldBySomeoneElse && !isAdmin) {
      throw new BadRequestException(
        'Another agent has this conversation. They can hand it back, or a firm admin can.'
      );
    }

    const updated = await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: {
        mode: ConversationMode.BOT,
        assignedUserId: null,
        resolvedAt: new Date(),
      },
    });

    await this.audit(binding.id, 'CONVERSATION_RESOLVED', tenantContext, {
      oldValues: { assignedUserId: binding.assignedUserId },
    });
    return updated;
  }

  /**
   * Load a binding this operator is entitled to see.
   *
   * Cross-tenant reads look like a 404 rather than a 403, so the queue cannot
   * be probed for the existence of another firm's conversations — the same
   * defence-in-depth choice as `CasesService.assertAccess`.
   */
  private async getBinding(id: string, tenantContext: TenantContext) {
    const binding = await this.prisma.conversationBinding.findUnique({
      where: { id },
      include: {
        claimant: { select: { id: true, fullName: true, phoneNumber: true } },
        activeCase: {
          select: { id: true, caseNumber: true, status: true, travelClaimType: true },
        },
      },
    });

    if (!binding) throw new NotFoundException('Conversation not found');
    if (tenantContext.userRole === 'SUPER_ADMIN') return binding;
    if (binding.tenantId !== tenantContext.tenantId) {
      throw new NotFoundException('Conversation not found');
    }
    return binding;
  }

  private async audit(
    entityId: string,
    action: string,
    tenantContext: TenantContext,
    options: { oldValues?: unknown; newValues?: unknown; metadata?: unknown } = {}
  ) {
    await this.auditService.record({
      entityId,
      entityType: 'CONVERSATION',
      action,
      oldValues: options.oldValues,
      newValues: options.newValues,
      metadata: options.metadata,
      tenantId: tenantContext.tenantId,
      userId: tenantContext.userId,
      actorId: tenantContext.userId,
      actorType: tenantContext.userRole ?? 'SYSTEM',
    });
  }
}
