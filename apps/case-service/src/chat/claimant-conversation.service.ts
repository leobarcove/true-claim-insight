import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  CaseChannel,
  ConversationMode,
  MessageDirection,
} from '@prisma/client';

import { getStep } from '@tci/shared-types';

import { PrismaService } from '../config/prisma.service';
import { ConversationGateway } from './conversation.gateway';
import { FlowsService } from '../cases/flows.service';
import type { TenantContext } from '../common/guards/tenant.guard';
import { TenantScope } from '../common/decorators/tenant.decorator';
import { CasesService } from '../cases/cases.service';

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
    private readonly gateway: ConversationGateway,
    private readonly flows: FlowsService,
    private readonly cases: CasesService
  ) {}

  /**
   * The binding for whoever is talking — a logged-in claimant, or a visitor.
   *
   * One binding per identity, guaranteed by the (channel, platformUserId)
   * unique constraint rather than by checking first: two tabs opened together
   * would otherwise both find nothing and both create one.
   *
   * Two identities reach this channel and they are not the same thing:
   *
   *  - A **signed-in claimant** is already known. The binding is keyed on their
   *    id and marked verified on creation, because the login did that work.
   *  - A **visitor** on the public link is nobody yet. The binding is keyed on
   *    an opaque session id with `claimantId` null and `verifiedAt` unset, and
   *    the conversation itself asks for a number and proves it — the same shape
   *    as a WhatsApp binding before its first message resolves.
   *
   * Keying on the session rather than the claimant is what allows a
   * conversation to exist *before* an identity does, which is the whole point
   * of the public flow: no login page in front of the chat.
   */
  async bindingFor(identity: TenantContext | { sessionId: string }) {
    if ('sessionId' in identity) {
      return this.prisma.conversationBinding.upsert({
        where: {
          channel_platformUserId: {
            channel: CaseChannel.WEB_CHAT,
            platformUserId: identity.sessionId,
          },
        },
        update: { lastSeenAt: new Date() },
        create: {
          channel: CaseChannel.WEB_CHAT,
          platformUserId: identity.sessionId,
          // Deliberately unbound and unverified. The onboarding steps in
          // ConversationGateway fill both in once a code has been proved, and
          // until then nothing about any claim is said.
          claimantId: null,
          mode: ConversationMode.BOT,
          lastSeenAt: new Date(),
        },
      });
    }

    const claimantId = identity.userId;

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
        tenantId: identity.tenantId,
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
    identity: TenantContext | { sessionId: string },
    turn: {
      clientMessageId: string;
      text?: string;
      callbackValue?: string;
      callbackStepId?: string;
      storedDocumentId?: string;
      locale?: string;
    }
  ) {
    const binding = await this.bindingFor(identity);

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
   * Attach evidence from a conversation that has no login behind it.
   *
   * The authenticated PWA uploads through `/cases/:id/documents/upload`, which
   * derives the case and the tenant from the claimant's token. A visitor on the
   * public link has no token, so the binding stands in for it — but only once
   * it has earned the right to:
   *
   *  - `claimantId` set means a code was verified. Without it the upload is
   *    refused outright: an unauthenticated endpoint that accepts files and
   *    attaches them to a claim is a way to put anything into someone's case
   *    file.
   *  - `activeCaseId` set means there is a claim to attach to. A document with
   *    no case would be stored and orphaned.
   *
   * The context handed to CasesService is the claimant's own, so every
   * ownership check downstream runs exactly as it does for a logged-in one.
   */
  async uploadDocument(identity: { sessionId: string }, file: unknown) {
    const binding = await this.bindingFor(identity);

    if (!binding.claimantId) {
      throw new ForbiddenException('Verify your mobile number before attaching a document.');
    }
    if (!binding.activeCaseId) {
      throw new BadRequestException('There is no claim open to attach this to yet.');
    }

    return this.cases.uploadDocument(binding.activeCaseId, file as never, {
      tenantId: binding.tenantId ?? '',
      userId: binding.claimantId,
      userRole: 'CLAIMANT',
      scope: TenantScope.STRICT,
      allowCrossTenant: false,
    });
  }

  /**
   * The conversation as the claimant should see it.
   *
   * Outbound messages an operator sent are included — from the claimant's side
   * a reply from the firm is a reply from the firm, and hiding it would leave
   * them staring at an unanswered question a human had in fact answered. The
   * handover *reason* is not: that is an internal note about their claim.
   */
  async transcript(identity: TenantContext | { sessionId: string }) {
    const binding = await this.bindingFor(identity);

    const messages = await this.prisma.conversationMessage.findMany({
      where: {
        bindingId: binding.id,
        // Only the two directions the claimant is party to. Notes agents leave
        // each other live on the same thread — that is the point of them — and
        // an allow-list is the only safe way to read it: a query that excluded
        // INTERNAL by name would start leaking the day a third internal kind
        // is added, and it would leak silently.
        direction: { in: [MessageDirection.INBOUND, MessageDirection.OUTBOUND] },
        // The synthetic opener, hidden. `start()` sends the literal text
        // "start" to make the gateway say the first thing — it is a trigger,
        // not something the claimant typed, and it rendered as their own first
        // message: a conversation that opens with the visitor apparently
        // saying "start" to nobody.
        //
        // Written as an OR rather than a bare NOT because outbound rows carry
        // no platformMessageId until the platform returns one, and in SQL
        // `NOT (NULL LIKE '%:start')` is NULL, not true — a plain NOT silently
        // filtered out every message the bot had sent.
        OR: [
          { platformMessageId: null },
          { platformMessageId: { not: { endsWith: ':start' } } },
        ],
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
        // A document turn carries no text — the claimant sent a file, not
        // words. Without this the PWA had nothing to render and drew an empty
        // bubble, so an upload that had in fact succeeded looked like a
        // message that had failed to send.
        caseDocumentId: true,
        createdAt: true,
      },
    });

    return {
      bindingId: binding.id,
      // So the PWA can say "a colleague is looking at this" rather than
      // leaving the claimant typing into a bot that has stood down.
      withAgent: binding.mode === ConversationMode.HANDOVER,
      caseId: binding.activeCaseId,
      currentStep: await this.openQuestion(binding),
      messages: messages.map(message => ({
        id: message.id,
        direction: message.direction,
        text: message.text,
        stepId: message.stepId,
        /** True when a person wrote it, so the PWA can label it as such. */
        fromAgent: message.direction === MessageDirection.OUTBOUND && message.sentByUserId !== null,
        /**
         * This turn was a file. The id is not handed out — a claimant does not
         * need it and every document read is staff-only — but the fact that
         * one exists is what lets the bubble say so.
         */
        hasAttachment: message.caseDocumentId !== null,
        createdAt: message.createdAt,
      })),
    };
  }

  /**
   * The question the claimant is being asked, if any.
   *
   * Resolved here rather than in the browser, and this is the load-bearing
   * decision of the whole channel. A push adapter is handed the step and
   * renders its keyboard from it; a pull client has only what was persisted,
   * and the transcript stores text, not choices. If the PWA had to work out
   * the current step for itself it would need the flow, the answers and the
   * branching rules — which is precisely the second intake implementation this
   * work exists to delete. So the server says what is open and the PWA renders
   * a control for it.
   *
   * Null while a person has the conversation: the bot is not asking anything,
   * and offering a date picker under an agent's message would be a lie about
   * what happens next.
   */
  private async openQuestion(binding: {
    id: string;
    mode: ConversationMode;
    activeCaseId: string | null;
    locale: string | null;
  }) {
    if (binding.mode === ConversationMode.HANDOVER) return null;

    // Before a Case exists the open question is consent, or which kind of
    // claim this is. Neither belongs to a flow — no flow has been chosen — so
    // the gateway rebuilds whichever was last asked. Delegated rather than
    // matched on here: a synthetic step added later would otherwise render as
    // a question with no controls, which is how a claimant gets stranded.
    if (!binding.activeCaseId) {
      const last = await this.prisma.conversationMessage.findFirst({
        where: { bindingId: binding.id, direction: MessageDirection.OUTBOUND },
        orderBy: { createdAt: 'desc' },
        select: { stepId: true },
      });
      if (!last?.stepId) return null;
      return this.gateway.synthesiseStep(last.stepId, binding.locale);
    }

    const caseRow = await this.prisma.case.findUnique({
      where: { id: binding.activeCaseId },
      select: { currentStepId: true, travelClaimType: true, flowDefinitionId: true },
    });
    if (!caseRow?.currentStepId) return null;

    // The pinned version, not the built-in flow: a Case walks the wording and
    // structure it started with, and showing the claimant a newer prompt than
    // the one they are answering is how the two drift apart.
    // Overlaid for this channel and language, so a Malay claimant reads the
    // Malay wording — the same resolution Telegram gets, from the same place.
    const flow = await this.flows.forCase(caseRow, {
      channel: CaseChannel.WEB_CHAT,
      locale: binding.locale ?? 'en',
    });
    return getStep(flow, caseRow.currentStepId) ?? null;
  }

  /**
   * Ask the bot to open the conversation.
   *
   * A messaging claimant says "hi" first; a claimant who has just tapped
   * "Start a claim" has already said it by arriving. Without this the PWA
   * would render an empty thread and wait for someone who is waiting for it.
   */
  async start(identity: TenantContext | { sessionId: string }, locale?: string) {
    const binding = await this.bindingFor(identity);

    const alreadyTalking = await this.prisma.conversationMessage.count({
      where: { bindingId: binding.id, direction: MessageDirection.OUTBOUND },
    });
    if (alreadyTalking > 0) return this.transcript(identity);

    await this.handleTurn(identity, {
      clientMessageId: 'start',
      text: 'start',
      locale,
    });
    return this.transcript(identity);
  }
}
