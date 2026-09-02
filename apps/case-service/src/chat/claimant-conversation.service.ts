import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import {
  CaseChannel,
  CaseStatus,
  ConsentPurpose,
  ConversationMessageStatus,
  ConversationMode,
  MessageDirection,
} from '@prisma/client';

import { getStep, type CaseAnswers } from '@tci/shared-types';

import { PrismaService } from '../config/prisma.service';
import { ConversationGateway } from './conversation.gateway';
import { ConsentService } from '../consent/consent.service';
import { FlowsService } from '../cases/flows.service';
import type { TenantContext } from '../common/guards/tenant.guard';
import { TenantScope } from '../common/decorators/tenant.decorator';
import { CasesService } from '../cases/cases.service';

/** The synthetic step ids the gateway asks before any flow is chosen. */
const CONSENT_STEP_ID = '__consent';
const CLAIM_TYPE_STEP_ID = '__claim-type';

/**
 * Statuses that mean the claimant is finished: the request is in, and the form
 * shows the submitted page rather than a section to fill in. Everything before
 * SUBMITTED is still theirs to edit; everything after is the firm's to work.
 */
const SUBMITTED_STATUSES = new Set<CaseStatus>([
  CaseStatus.SUBMITTED,
  CaseStatus.UNDER_REVIEW,
  CaseStatus.INFO_REQUESTED,
  CaseStatus.REFERRED_TO_EXPERT,
  CaseStatus.CONVERTED,
  CaseStatus.REJECTED,
]);

/**
 * Everything the form needs to draw itself.
 *
 * Declared as one shape with optional parts rather than a discriminated union
 * on `stage`. A union would be tidier to read and worse to use: every consumer
 * would have to narrow before touching `case`, and the client walking the flow
 * wants `case` and `flow` together with the stage as one more fact about them.
 * The optional fields are documented by which stage supplies them.
 */
export interface PublicConversationState {
  /** Which screen the form should draw. Derived here, never guessed by the client. */
  stage: 'phone' | 'code' | 'consent' | 'claim-type' | 'flow' | 'submitted';
  locale: 'en' | 'ms';
  /** The bot's most recent message — the form's error text. */
  lastReply: string | null;
  /**
   * `stage === 'code'`: the number a code was sent to, so the form can say
   * where to look for it.
   *
   * Returned in full rather than masked. It is the claimant's own number, which
   * they typed into this same session moments ago — masking it would hide the
   * one thing that lets them notice a typo, which is exactly what this screen
   * is for. Nothing else about them is said until a code is proved.
   */
  pendingPhone?: string;
  /** `stage === 'consent'`: the approved notice, shown exactly as returned. */
  consent?: { title: string; body: string; version: number };
  /** `stage === 'claim-type'`: the choices for the pre-claim question. */
  claimTypes?: unknown;
  /** `stage === 'flow' | 'submitted'`: same shape as `GET /cases/:id`. */
  case?: Record<string, unknown>;
  /** `stage === 'flow' | 'submitted'`: same shape as `GET /cases/:id/flow`. */
  flow?: unknown;
}

/** PDPA notices exist in exactly these two languages; anything else reads English. */
const noticeLocale = (locale: string | null | undefined): 'en' | 'ms' =>
  locale === 'ms' ? 'ms' : 'en';

/**
 * Who is talking.
 *
 * Three shapes, not two, since the Mini App: a logged-in claimant, an
 * anonymous web visitor, and a claimant already bound on a messaging channel
 * who has stepped onto that channel's richer surface. The third resolves to a
 * binding that already exists rather than making one — see `bindingFor`.
 */
export type ConversationIdentity =
  | TenantContext
  | { sessionId: string; webChannel?: CaseChannel }
  | { channel: CaseChannel; platformUserId: string };

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
    private readonly cases: CasesService,
    private readonly consent: ConsentService
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
  async bindingFor(identity: ConversationIdentity) {
    // A claimant already talking on a messaging channel, who has opened the
    // richer surface that channel offers — a Telegram Mini App today, a
    // WhatsApp Flow next. Found, never created, and that is the security
    // property: the binding exists because the platform already vouched for
    // this person and they proved a number to the bot. Creating one here
    // would mean an attested id alone could conjure a conversation, which is
    // the opposite of what the attestation is for.
    //
    // The caller has verified the attestation before we get here. This method
    // only refuses to invent what it cannot find.
    if ('platformUserId' in identity) {
      const binding = await this.prisma.conversationBinding.findUnique({
        where: {
          channel_platformUserId: {
            channel: identity.channel,
            platformUserId: identity.platformUserId,
          },
        },
      });
      if (!binding) {
        throw new ForbiddenException('Start a claim in the chat before opening the form.');
      }
      await this.prisma.conversationBinding.update({
        where: { id: binding.id },
        data: { lastSeenAt: new Date() },
      });
      return binding;
    }

    if ('sessionId' in identity) {
      // WEB_CHAT unless the gateway said otherwise. The form is its own
      // channel, so the same visitor on /form and on /chat holds two bindings
      // that never meet — and because the binding key is (channel,
      // platformUserId), this line is the whole of that separation
      // (WEB_FORM_MICROSITE_PLAN D1). The value comes from the signed session
      // payload, not from anything the browser can set.
      const webChannel = identity.webChannel ?? CaseChannel.WEB_CHAT;

      return this.prisma.conversationBinding.upsert({
        where: {
          channel_platformUserId: {
            channel: webChannel,
            platformUserId: identity.sessionId,
          },
        },
        update: { lastSeenAt: new Date() },
        create: {
          channel: webChannel,
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
    identity: ConversationIdentity,
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
      // The binding's own channel, not this class's. A Mini App turn arrives
      // here but belongs to a TELEGRAM binding, and the reply has to reach the
      // thread as well as the webview — the claimant may close the Mini App
      // mid-question, and a conversation that continued only inside a window
      // they shut is one they cannot get back to.
      channel: binding.channel,
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
  async uploadDocument(identity: ConversationIdentity, file: unknown) {
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
  async transcript(identity: ConversationIdentity) {
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
      select: {
        currentStepId: true,
        travelClaimType: true,
        flowDefinitionId: true,
        answers: true,
      },
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

    // A claimant who asked to change something is looking at the edit menu, and
    // the menu belongs to no flow — so `getStep` found nothing and the PWA drew
    // a question with no way to answer it. The case's cursor has not moved
    // (they are still on the review step), so what is open has to be read from
    // the last thing the bot actually asked. Closes INTAKE_CHANGE_SOMETHING_GAP.
    const lastAsked = await this.prisma.conversationMessage.findFirst({
      where: { bindingId: binding.id, direction: MessageDirection.OUTBOUND, stepId: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { stepId: true },
    });
    if (lastAsked?.stepId && lastAsked.stepId !== caseRow.currentStepId) {
      const synthesised = await this.gateway.synthesiseStep(lastAsked.stepId, binding.locale, {
        flow,
        answers: (caseRow.answers ?? {}) as CaseAnswers,
      });
      if (synthesised) return synthesised;
    }

    return getStep(flow, caseRow.currentStepId) ?? null;
  }

  /**
   * Ask the bot to open the conversation.
   *
   * A messaging claimant says "hi" first; a claimant who has just tapped
   * "Start a claim" has already said it by arriving. Without this the PWA
   * would render an empty thread and wait for someone who is waiting for it.
   */
  async start(identity: ConversationIdentity, locale?: string) {
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

  /**
   * Everything the form needs to draw itself, in one read.
   *
   * The chat asks one question at a time, so the transcript is enough for it:
   * the last bubble *is* the state. A form shows a whole section at once and
   * has to know which section, what has been answered, what is still missing
   * and what the flow will ask next — the same picture a logged-in claimant
   * already gets from `GET /cases/:id` and `GET /cases/:id/flow`. A visitor has
   * no case id and no login, so neither is reachable; this mirrors the pair for
   * the session instead.
   *
   * Deliberately not a new description of a claim. The two payloads are the
   * *same shapes* those endpoints return, produced by the same service methods,
   * so a change to either reaches the form without being copied — which is the
   * whole reason the form is cheap to build.
   */
  async state(identity: ConversationIdentity): Promise<PublicConversationState> {
    const binding = await this.bindingFor(identity);
    const locale = noticeLocale(binding.locale);

    // The bot's last word. On the chat this is just the newest bubble; on the
    // form it is the error text — the reason a section refused to advance,
    // shown under the field that caused it.
    const lastOutbound = await this.prisma.conversationMessage.findFirst({
      where: {
        bindingId: binding.id,
        direction: MessageDirection.OUTBOUND,
        status: { not: ConversationMessageStatus.FAILED },
      },
      orderBy: { createdAt: 'desc' },
      select: { text: true, stepId: true },
    });

    const base = { locale, lastReply: lastOutbound?.text ?? null };

    // Before a code is proved there is no claimant, and nothing about any claim
    // is said. These two stages are the whole of what an unverified visitor can
    // learn from this endpoint.
    if (!binding.claimantId) {
      return binding.pendingPhone
        ? { ...base, stage: 'code', pendingPhone: binding.pendingPhone }
        : { ...base, stage: 'phone' };
    }

    if (!binding.activeCaseId) {
      // Verified, but no Case yet: the open question is consent or which kind
      // of claim this is. Neither belongs to a flow — none has been chosen —
      // so which one is open is read from the last thing the bot asked.
      if (lastOutbound?.stepId === CONSENT_STEP_ID) {
        const notice = await this.consent.currentNotice(
          ConsentPurpose.CLAIM_PROCESSING,
          locale
        );
        return {
          ...base,
          stage: 'consent',
          consent: notice
            ? { title: notice.title, body: notice.body, version: notice.version }
            : undefined,
        };
      }

      const menu = await this.gateway.synthesiseStep(CLAIM_TYPE_STEP_ID, binding.locale);
      return { ...base, stage: 'claim-type', claimTypes: menu?.choices };
    }

    // The claimant's own context, so every ownership check downstream runs
    // exactly as it would for a logged-in one. `findOne` refuses a case that is
    // not theirs, which is what makes the session safe to trust here.
    const context = {
      tenantId: binding.tenantId ?? '',
      userId: binding.claimantId,
      userRole: 'CLAIMANT' as const,
      scope: TenantScope.STRICT,
      allowCrossTenant: false,
    };

    const [caseDetail, flow] = await Promise.all([
      this.cases.findOne(binding.activeCaseId, context),
      this.cases.getFlowForCase(binding.activeCaseId, context),
    ]);

    return {
      ...base,
      stage: SUBMITTED_STATUSES.has(caseDetail.status as CaseStatus) ? 'submitted' : 'flow',
      case: { ...caseDetail, documents: caseDetail.documents.map(publicDocument) },
      flow,
    };
  }
}

/**
 * A document as the claimant may see it: that it exists, what it was called,
 * and when it arrived.
 *
 * The id is removed, not merely unused. Every document read is staff-only, so
 * an id in this payload would be a handle to an endpoint the holder cannot
 * call — useless at best, and the sort of thing a later change turns into a
 * public route by accident. The transcript has never returned one either; this
 * adds a filename and nothing more.
 */
function publicDocument(document: {
  fileName: string;
  documentType: string;
  stepId: string | null;
  createdAt: Date;
}) {
  return {
    fileName: document.fileName,
    documentType: document.documentType,
    stepId: document.stepId,
    createdAt: document.createdAt,
  };
}
