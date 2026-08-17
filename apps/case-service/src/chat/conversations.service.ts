import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ConversationMessageStatus,
  ConversationMode,
  ConversationStatus,
  MessageDirection,
  UserRole,
  UserTenantStatus,
} from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import type { TenantContext } from '../common/guards/tenant.guard';
import { ConversationGateway } from './conversation.gateway';

/**
 * Roles that can hold a claimant conversation.
 *
 * The same list the controller gates on, in one place: a role that can be
 * assigned work but cannot open the queue has been handed a conversation into
 * a room it cannot enter, and that is indistinguishable from dropping it.
 */
export const ASSIGNABLE_ROLES = [
  UserRole.ADJUSTER,
  UserRole.FIRM_ADMIN,
  UserRole.SUPPORT_DESK,
  UserRole.SUPER_ADMIN,
] as const;

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
          select: {
            id: true,
            caseNumber: true,
            status: true,
            travelClaimType: true,
            // The regulated engagement, once conversion has created it. The
            // inbox otherwise labels a Case with claim language and has
            // nowhere to send an operator who wants the Claim itself.
            convertedClaim: { select: { id: true, claimNumber: true, status: true } },
          },
        },
        messages: {
          // The preview is what the conversation said, so an internal note is
          // excluded: a queue row reading "note: chase the policy number" next
          // to a claimant's name looks like something we sent them.
          where: {
            direction: { in: [MessageDirection.INBOUND, MessageDirection.OUTBOUND] },
          },
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
      // A snooze whose time has passed reads as OPEN rather than being woken by
      // a scheduler. Computed, so there is no job to fall over and no window in
      // which a due conversation is invisible because the sweep has not run.
      status:
        binding.status === ConversationStatus.SNOOZED &&
        binding.snoozedUntil !== null &&
        binding.snoozedUntil <= new Date()
          ? ConversationStatus.OPEN
          : binding.status,
      snoozedUntil: binding.snoozedUntil,
      firstRespondedAt: binding.firstRespondedAt,
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

  /**
   * Who this conversation can be handed to.
   *
   * Derived from tenant membership rather than a configured list, so somebody
   * who joins the firm can be assigned work without a second setup step, and
   * somebody who leaves stops appearing the moment their membership ends.
   */
  async assignableAgents(tenantContext: TenantContext) {
    const memberships = await this.prisma.userTenant.findMany({
      where: {
        tenantId: tenantContext.tenantId ?? undefined,
        status: UserTenantStatus.ACTIVE,
        role: { in: [...ASSIGNABLE_ROLES] },
      },
      select: { role: true, user: { select: { id: true, fullName: true } } },
      orderBy: { user: { fullName: 'asc' } },
    });

    return memberships.map(membership => ({
      id: membership.user.id,
      fullName: membership.user.fullName,
      role: membership.role,
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
      status: binding.status,
      snoozedUntil: binding.snoozedUntil,
      firstRespondedAt: binding.firstRespondedAt,
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
        status: ConversationStatus.OPEN,
        snoozedUntil: null,
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
    await this.clearAwaitingAgent(binding.id);

    // The ball is with the claimant, and the first-response clock stops. Both
    // written here rather than in the UI because a reply *is* the event —
    // deriving either from message timestamps later means reconstructing which
    // outbound row was the first one that counted.
    await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: {
        status: ConversationStatus.PENDING,
        snoozedUntil: null,
        ...(binding.firstRespondedAt ? {} : { firstRespondedAt: new Date() }),
      },
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
   * Break the link between this chat and the claimant.
   *
   * A binding was otherwise permanent: `verifiedAt` is written once, and
   * without this there was no way to undo it — a claimant who bound the wrong
   * (but owned) number, or one whose Telegram account was taken over, could
   * only be helped by editing the database.
   *
   * The row is kept rather than deleted, so the transcript and its history
   * survive; only the identity link and the active case are cleared. The next
   * message from that chat starts at "share your number", which is the correct
   * place for someone we can no longer vouch for.
   */
  async unbind(id: string, reason: string, tenantContext: TenantContext) {
    const binding = await this.getBinding(id, tenantContext);

    const updated = await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: {
        verifiedAt: null,
        claimantId: null,
        activeCaseId: null,
        pendingPhone: null,
        mode: ConversationMode.BOT,
        assignedUserId: null,
      },
    });

    // Who unbound whom, and why. Revoking someone's access to their own claim
    // conversation is an act that has to be explicable afterwards.
    await this.audit(binding.id, 'CONVERSATION_UNBOUND', tenantContext, {
      oldValues: { claimantId: binding.claimantId, verifiedAt: binding.verifiedAt },
      metadata: { reason },
    });
    await this.clearAwaitingAgent(binding.id);
    this.logger.warn(`Binding ${binding.id} unbound by ${tenantContext.userId}: ${reason}`);
    return updated;
  }

  /**
   * Statuses an agent may set directly.
   *
   * `BOT` and `RESOLVED` are absent deliberately: both mean "the bot has it
   * back", and that is `resolve()` — a real transition with its own side
   * effects, not a label. Letting it be set as a status would leave a
   * conversation reading as resolved while the bot was still stood down, so
   * the claimant's next message met silence.
   */
  private static readonly AGENT_SETTABLE: ConversationStatus[] = [
    ConversationStatus.OPEN,
    ConversationStatus.PENDING,
    ConversationStatus.SNOOZED,
  ];

  /**
   * May this operator change who holds the conversation, or its state?
   *
   * The holder may, an unheld conversation is anybody's, and an admin may
   * always — because the alternative is a thread frozen by whoever went home
   * with it assigned. Same rule as `resolve`, extracted so the four actions
   * cannot drift into four different answers.
   */
  private assertMayManage(
    binding: { assignedUserId: string | null },
    tenantContext: TenantContext
  ) {
    const heldBySomeoneElse =
      binding.assignedUserId !== null && binding.assignedUserId !== tenantContext.userId;
    const isAdmin =
      tenantContext.userRole === 'FIRM_ADMIN' || tenantContext.userRole === 'SUPER_ADMIN';

    if (heldBySomeoneElse && !isAdmin) {
      throw new BadRequestException(
        'Another agent has this conversation. They can hand it on, or a firm admin can.'
      );
    }
  }

  /**
   * Hand the conversation to a colleague.
   *
   * Distinct from `takeOver`, which is only ever self-service. Passing work to
   * somebody else is the ordinary case in a team of more than one — the shift
   * ends, the question needs the person who knows the policy — and until now
   * it was impossible: an agent could take a conversation or hand it back to
   * the bot, and nothing in between.
   *
   * The assignee is checked to be a real user in this tenant with a role that
   * can actually answer. Assigning to somebody who cannot open the queue is
   * indistinguishable from dropping the conversation, and reads as done.
   */
  async assign(id: string, assigneeId: string | null, tenantContext: TenantContext) {
    const binding = await this.getBinding(id, tenantContext);
    this.assertMayManage(binding, tenantContext);

    if (assigneeId) {
      // Membership, not `User.tenantId` — that column is deprecated and a user
      // can belong to several firms. The role that matters is the one they
      // hold *in this tenant*, which is the only place it is recorded.
      const membership = await this.prisma.userTenant.findFirst({
        where: {
          userId: assigneeId,
          tenantId: tenantContext.tenantId ?? undefined,
          status: UserTenantStatus.ACTIVE,
          role: { in: [...ASSIGNABLE_ROLES] },
        },
        select: { userId: true },
      });
      if (!membership) {
        throw new BadRequestException(
          'That person cannot take conversations — check they are active in your firm.'
        );
      }
    }

    const updated = await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: {
        assignedUserId: assigneeId,
        // Handing work over implies there is work: an assignment while the bot
        // is still answering would otherwise sit in nobody's queue.
        ...(binding.mode === ConversationMode.HANDOVER && assigneeId
          ? { status: ConversationStatus.OPEN, snoozedUntil: null }
          : {}),
      },
    });

    await this.audit(binding.id, 'CONVERSATION_ASSIGNED', tenantContext, {
      oldValues: { assignedUserId: binding.assignedUserId },
      newValues: { assignedUserId: assigneeId },
    });
    return updated;
  }

  /**
   * Move the conversation through the queue without saying anything.
   *
   * The distinction that earns this its own action: "waiting on them" and
   * "waiting on us" look identical in a list sorted by time, and only one of
   * them is anybody's problem.
   */
  async setStatus(
    id: string,
    status: ConversationStatus,
    snoozedUntil: Date | null,
    tenantContext: TenantContext
  ) {
    const binding = await this.getBinding(id, tenantContext);
    this.assertMayManage(binding, tenantContext);

    if (!ConversationsService.AGENT_SETTABLE.includes(status)) {
      throw new BadRequestException(
        'Use hand back to the bot to close a conversation, rather than setting its status.'
      );
    }
    if (status === ConversationStatus.SNOOZED && !snoozedUntil) {
      // A snooze with no wake time is a conversation nobody will ever see
      // again — the failure mode of every "later" pile.
      throw new BadRequestException('Say when it should come back.');
    }
    if (snoozedUntil && snoozedUntil.getTime() <= Date.now()) {
      throw new BadRequestException('Choose a time in the future.');
    }

    const updated = await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: {
        status,
        snoozedUntil: status === ConversationStatus.SNOOZED ? snoozedUntil : null,
      },
    });

    await this.audit(binding.id, 'CONVERSATION_STATUS_CHANGED', tenantContext, {
      oldValues: { status: binding.status },
      newValues: { status, snoozedUntil },
    });
    return updated;
  }

  /**
   * Leave a note for whoever picks this up next.
   *
   * Stored on the thread, in order, alongside what was actually said — because
   * the context is worth nothing anywhere else. A note in a side channel is a
   * note the next person does not have.
   *
   * `direction: INTERNAL` keeps it off every claimant-facing path, and those
   * paths allow-list the two directions they may show rather than excluding
   * this one by name: an exclusion list starts leaking the day a third
   * internal kind is added, and it does so silently.
   */
  async addNote(id: string, text: string, tenantContext: TenantContext) {
    const binding = await this.getBinding(id, tenantContext);

    const note = await this.prisma.conversationMessage.create({
      data: {
        channel: binding.channel,
        direction: MessageDirection.INTERNAL,
        bindingId: binding.id,
        text,
        sentByUserId: tenantContext.userId,
        // Never sent anywhere, so it is complete the moment it is written.
        status: ConversationMessageStatus.PROCESSED,
        processedAt: new Date(),
      },
    });

    // Audited like any other note on a claim file. The body is deliberately
    // not copied into the audit row — it is already on the thread, and a
    // second copy widens the retention surface for nothing.
    await this.audit(binding.id, 'CONVERSATION_NOTE_ADDED', tenantContext, {
      metadata: { characters: text.length },
    });
    return note;
  }

  /**
   * Nothing on this conversation is waiting for a person any more.
   *
   * Called wherever the wait ends, which is not only when an agent replies:
   * handing back to the bot and unbinding both end it too. Only `reply` cleared
   * it, so an agent who read a conversation, decided no answer was needed and
   * handed it back left the badge showing for ever — a queue that counts work
   * nobody has to do is a queue people stop believing.
   *
   * `PROCESSED` rather than a status of its own. It slightly overstates things
   * — the bot resuming is not the same as a human answering — but the column
   * drives one question, "is somebody waiting?", and the honest answer here is
   * no. A new status would have to be taught to every screen that renders one.
   */
  private async clearAwaitingAgent(bindingId: string) {
    await this.prisma.conversationMessage.updateMany({
      where: { bindingId, status: ConversationMessageStatus.AWAITING_AGENT },
      data: { status: ConversationMessageStatus.PROCESSED, processedAt: new Date() },
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
        status: ConversationStatus.RESOLVED,
        snoozedUntil: null,
        assignedUserId: null,
        resolvedAt: new Date(),
      },
    });

    await this.clearAwaitingAgent(binding.id);

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
          select: {
            id: true,
            caseNumber: true,
            status: true,
            travelClaimType: true,
            // The regulated engagement, once conversion has created it. The
            // inbox otherwise labels a Case with claim language and has
            // nowhere to send an operator who wants the Claim itself.
            convertedClaim: { select: { id: true, claimNumber: true, status: true } },
          },
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
