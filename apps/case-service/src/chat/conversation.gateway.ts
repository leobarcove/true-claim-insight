import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CaseChannel,
  CaseInitiator,
  ConsentChannel,
  ConsentPurpose,
  ConversationMessageStatus,
  ConversationMode,
  MessageDirection,
  Prisma,
  TravelClaimType,
} from '@prisma/client';
import {
  branchInputSteps,
  CHANNEL_CAPABILITIES,
  CONSENT_AGREED_VALUE,
  describeCallbackValue,
  EDIT_CALLBACK_PREFIX,
  getStep,
  parseTextDate,
  ANSWER_MASK_PREFIX,
  SENSITIVE_ANSWER_STEPS,
  SHARED_PHONE_DESCRIPTION,
  SKIP_VALUE,
  summariseAnswers,
  TRAVEL_CLAIM_TYPE_LABELS,
  validateAnswer,
  type CaseAnswers,
  type CaseFlow,
  type FlowStep,
} from '@tci/shared-types';
import { TransferRegister, type OffshoreProviderKey } from '@tci/prisma-client';
import { PrismaService } from '../config/prisma.service';
import { CasesService } from '../cases/cases.service';
import type { CreateCaseDto } from '../cases/dto/create-case.dto';
import { FlowsService } from '../cases/flows.service';
import { ConsentService } from '../consent/consent.service';
import { TenantScope } from '../common/decorators/tenant.decorator';
import type { TenantContext } from '../common/guards/tenant.guard';
import {
  CHANNEL_ADAPTERS,
  PAGE_CALLBACK_PREFIX,
  type ChannelAdapter,
  type InboundTurnPayload,
  type OutboundPrompt,
} from './channel-adapter.interface';
import { ANSWER_NORMALISER, type AnswerNormaliser } from './answer-normaliser.interface';
import { CLAIMANT_RESOLVER, type ClaimantResolver } from './claimant-resolver.interface';

// EDIT_CALLBACK_PREFIX, CONSENT_AGREED_VALUE and PAGE_CALLBACK_PREFIX are
// imported from @tci/shared-types: the transcript renderer has to name these
// buttons too, and two copies of a magic string drift the day one is reworded.

/**
 * Words a claimant reasonably types to go back or change something.
 *
 * Matched as whole messages only. Someone answering "back" to a free-text
 * question might mean it literally, so these fire only when the message is
 * nothing but the word — and the check runs before parsing, so a step that
 * legitimately expects one of these still receives it via the edit menu.
 *
 * Malay included because that is what half the country will type.
 */
const BACK_WORDS = new Set(['back', 'undo', 'previous', '/back', 'kembali']);
const EDIT_WORDS = new Set(['edit', 'change', 'correct', '/edit', 'ubah']);

/** Asking for a person. Nothing in intake should trap someone who wants one. */
const HUMAN_WORDS = new Set(['human', 'agent', 'help', 'support', '/human', 'bantuan']);

/**
 * Inbound turns one chat may send per minute before we stop answering.
 *
 * The realistic attack on an open bot is not impersonation — the platform
 * vouches for the number and the channel discloses nothing back — it is
 * volume: junk intakes filling the vetting queue, or a script driving cost
 * through the analyser and the model. That is a throughput problem and wants
 * a throughput control.
 *
 * Set well above a real conversation. A claimant answering briskly sends a
 * message every few seconds; twenty a minute is someone or something else.
 */
const MAX_TURNS_PER_MINUTE = 20;

/**
 * Callback value behind the "I agree" button on the consent notice.
 *
 * Prefixed like the pagination marker so it can never collide with a real
 * choice value — a claimant selecting a cause of loss must not be able to
 * accidentally grant consent.
 */
const CONSENT_AGREED = CONSENT_AGREED_VALUE;

/**
 * Which approved notice to show, from a platform language tag.
 *
 * Only the two locales the approval gate guarantees exist. A tag we do not
 * publish falls back to English rather than failing: a notice in the wrong
 * language is a comprehension problem, but no notice at all refuses the claim
 * outright, and PDPA s.7 is better served by the former while the latter is
 * being fixed. Region subtags are ignored — `ms-MY` and `ms` read the same.
 */
/**
 * What a sensitive answer looks like in the transcript.
 *
 * The last four digits only, matching the answer bag, so an operator can still
 * tell one account from another without the transcript becoming a second
 * plaintext copy of it.
 */
function maskForTranscript(typed: string): string {
  const digits = typed.replace(/\D/g, '');
  return `${ANSWER_MASK_PREFIX}${digits.slice(-4)}`;
}

function noticeLocale(tag?: string | null): string {
  return tag?.toLowerCase().startsWith('ms') ? 'ms' : 'en';
}

/**
 * Handles one inbound turn from any messaging channel.
 *
 * Everything channel-specific lives behind ChannelAdapter; everything
 * claim-specific lives behind CasesService. What is left here is the part that
 * is genuinely shared: work out who sent this, what they are answering, and
 * what to say back.
 *
 * The order is deliberate and each step exists because of a specific failure:
 *
 *  1. Record the turn before interpreting it. A message nobody could parse
 *     still leaves a trace — the claimant believes they answered.
 *  2. Dedupe in the database, not in memory. Every platform retries delivery.
 *  3. Refuse to say anything about a claim until the sender is verified.
 *  4. Drive the flow pinned on the Case, never the built-in one, so a Telegram
 *     conversation and a browser conversation on the same Case agree.
 */
@Injectable()
export class ConversationGateway {
  private readonly logger = new Logger(ConversationGateway.name);
  private readonly transfers: TransferRegister;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly flows: FlowsService,
    @Inject(CLAIMANT_RESOLVER) private readonly claimants: ClaimantResolver,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapter[],
    @Inject(ANSWER_NORMALISER) private readonly normaliser: AnswerNormaliser,
    private readonly consent: ConsentService
  ) {
    // Every conversational turn crosses a border: the claimant's words reach
    // the platform's servers abroad, and ours reach them the same way. The
    // register entry and its passing test existed while nothing wrote a row —
    // the §3.6 shape, in the control added to close the very same gap.
    this.transfers = new TransferRegister(this.prisma, 'case-service', (entry, error) =>
      this.logger.error(
        `TRANSFER UNRECORDED: ${entry.provider} for a conversational turn`,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  /**
   * Which registered offshore provider carries this channel, if any.
   *
   * Null for a channel we host ourselves: web chat crosses no border, and
   * recording one would make the register useless by filling it with
   * non-events. A channel absent from the registry is a bug in the registry,
   * not a reason to skip the record — hence the log.
   */
  private offshoreProviderFor(channel: CaseChannel): OffshoreProviderKey | null {
    // Channels we host ourselves cross no border. Recording one would fill the
    // register with non-events and make the real rows harder to find.
    const inCountry: CaseChannel[] = [CaseChannel.WEB_CHAT, CaseChannel.STAFF, CaseChannel.EMAIL];
    if (inCountry.includes(channel)) return null;

    const byChannel: Partial<Record<CaseChannel, OffshoreProviderKey>> = {
      [CaseChannel.TELEGRAM]: 'TELEGRAM',
    };
    const provider = byChannel[channel];
    if (!provider) {
      // A messaging channel with no registry entry is a bug in the registry,
      // not a reason to transfer silently — WHATSAPP and MESSENGER will land
      // here the day an adapter for either is registered.
      this.logger.error(
        `Channel ${channel} has no entry in OFFSHORE_PROVIDERS; its transfers cannot be recorded.`
      );
      return null;
    }
    return provider;
  }

  private adapterFor(channel: CaseChannel): ChannelAdapter | undefined {
    return this.adapters.find(adapter => adapter.channel === channel);
  }

  /**
   * Entry point. Safe to call twice with the same payload — the second call
   * is a no-op, which is what makes platform delivery retries harmless.
   */
  async handleTurn(payload: InboundTurnPayload): Promise<void> {
    const adapter = this.adapterFor(payload.channel);
    if (!adapter) {
      this.logger.error(`No adapter registered for ${payload.channel}; turn dropped.`);
      return;
    }

    // 1 + 2. Insert-first. A unique violation *is* the "already seen" branch:
    // the database arbitrates, so two workers racing the same update produce
    // one answer rather than two. Same pattern as FNOL email ingestion.
    let messageId: string;
    try {
      const message = await this.prisma.conversationMessage.create({
        data: {
          channel: payload.channel,
          direction: MessageDirection.INBOUND,
          platformMessageId: payload.platformMessageId,
          // A turn that carried no text still has to read as something. A tap
          // gets the best description available without the step (the step is
          // not known until routing, and routing may never happen); a shared
          // contact gets a marker rather than the number, because this column
          // is neither encrypted nor swept by anonymisation and a transcript
          // must not become a second copy of personal data.
          text:
            payload.text ??
            describeCallbackValue(payload.callbackValue) ??
            (payload.sharedPhone ? SHARED_PHONE_DESCRIPTION : null),
          callbackValue: payload.callbackValue ?? null,
          mediaRef: payload.mediaRef ?? null,
        },
      });
      messageId = message.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        this.logger.debug(`Turn ${payload.platformMessageId} already seen; skipping.`);
        return;
      }
      throw error;
    }

    // Acknowledged before anything else is attempted, so the button stops
    // spinning even if the turn then fails. A claimant staring at a loading
    // indicator taps again, and the second tap is the one that corrupts.
    if (payload.callbackAckId && adapter.acknowledgeCallback) {
      await adapter.acknowledgeCallback(payload.callbackAckId);
    }

    try {
      await this.route(messageId, payload, adapter);
    } catch (error) {
      this.logger.error(
        `Turn ${payload.platformMessageId} failed: ${(error as Error).message}`,
        (error as Error).stack
      );
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: { status: ConversationMessageStatus.FAILED, error: (error as Error).message },
      });
      // The claimant is told something went wrong rather than left waiting.
      await this.safeSend(adapter, payload.platformUserId, {
        text: 'Sorry — something went wrong on our side. Please try again in a moment.',
      });
    }
  }

  /** Decide whether this turn is onboarding or an answer, and act on it. */
  private async route(
    messageId: string,
    payload: InboundTurnPayload,
    adapter: ChannelAdapter
  ): Promise<void> {
    const binding = await this.prisma.conversationBinding.upsert({
      where: {
        channel_platformUserId: {
          channel: payload.channel,
          platformUserId: payload.platformUserId,
        },
      },
      update: { lastSeenAt: new Date(), ...(payload.locale ? { locale: payload.locale } : {}) },
      create: {
        channel: payload.channel,
        platformUserId: payload.platformUserId,
        locale: payload.locale ?? null,
      },
    });

    await this.prisma.conversationMessage.update({
      where: { id: messageId },
      data: { bindingId: binding.id },
    });

    // Counted from the transcript rather than memory, so it survives a restart
    // and cannot be reset by whoever is causing it. The turn is still recorded
    // — a flood is exactly what an operator needs to be able to see — but
    // nothing further is done with it, and only the first refusal replies, so
    // the bot cannot be made to amplify the flood it is refusing.
    const recentTurns = await this.prisma.conversationMessage.count({
      where: {
        bindingId: binding.id,
        direction: MessageDirection.INBOUND,
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });
    if (recentTurns > MAX_TURNS_PER_MINUTE) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: { status: ConversationMessageStatus.FAILED, error: 'Rate limited', processedAt: new Date() },
      });
      if (recentTurns === MAX_TURNS_PER_MINUTE + 1) {
        this.logger.warn(`Binding ${binding.id} exceeded ${MAX_TURNS_PER_MINUTE} turns/minute.`);
        await this.say(adapter, binding.id, payload.platformUserId, {
          text: 'You are sending messages faster than we can read them. Please wait a moment.',
        });
      }
      return;
    }

    // The turn itself is the transfer: the claimant's words reached the
    // platform's servers abroad before we saw them, and the reply goes back
    // the same way. Recorded once per turn rather than per message, and after
    // the binding so the row can name the claimant it concerns.
    //
    // `lawfulBasis` is null on purpose. None is established for this channel
    // (§3.4), and a register that invents one is worse than the gap it papers
    // over — the honest row is what makes the gap visible enough to close.
    const provider = this.offshoreProviderFor(payload.channel);
    if (provider) {
      await this.transfers.record({
        provider,
        purpose: 'Conversational claim intake',
        lawfulBasis: null,
        claimantId: binding.claimantId,
      });
    }

    // 3. Nothing about a claim is served to an unverified sender.
    if (!binding.verifiedAt) {
      await this.runOnboarding(messageId, payload, adapter, binding);
      return;
    }

    // 4. A human has this conversation. Record what the claimant said and say
    //    nothing automated — a bot answering over an agent mid-exchange reads
    //    to the claimant as one confused party rather than two, and can
    //    overwrite a correction the agent just made.
    if (binding.mode === ConversationMode.HANDOVER) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: { status: ConversationMessageStatus.AWAITING_AGENT, processedAt: new Date() },
      });
      this.logger.debug(`Binding ${binding.id} is in handover; bot standing down.`);
      return;
    }

    await this.applyAnswer(messageId, payload, adapter, binding);
  }

  /**
   * Bind this chat to a claimant, on the platform's own evidence.
   *
   * One step: share the contact. No one-time code (decided 11 Aug 2026,
   * MASTER_PLAN §6). The code was going to the very number Telegram had
   * already vouched for, so it added little on this path — while the path it
   * genuinely protected, a typed number, is one this channel no longer offers.
   *
   * What carries the weight instead is the adapter's check that the shared
   * contact is the *sender's own*. `sharedPhone` is populated only when the
   * platform says so; a number the claimant types is not accepted at all,
   * because typing is exactly how you would claim to be somebody else.
   */
  private async runOnboarding(
    messageId: string,
    payload: InboundTurnPayload,
    adapter: ChannelAdapter,
    binding: { id: string }
  ): Promise<void> {
    await this.prisma.conversationMessage.update({
      where: { id: messageId },
      data: { status: ConversationMessageStatus.ONBOARDING, processedAt: new Date() },
    });

    // Someone shared a card from their address book. Refused, and said so:
    // silence after tapping share reads as a broken bot, and the honest
    // explanation is one sentence.
    if (payload.sharedForeignContact) {
      this.logger.warn(`Binding ${binding.id}: foreign contact refused.`);
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          'That contact belongs to someone else, so we cannot use it. Please use the ' +
          '"Share my number" button below to send your own.',
        requestPhone: true,
      });
      return;
    }

    if (!payload.sharedPhone) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          'Welcome to True Claim Insight. Before we begin, we need to know who you are. ' +
          'Please tap the button below to share your mobile number — typing it will not work, ' +
          'because we rely on Telegram confirming the number is yours.',
        requestPhone: true,
      });
      return;
    }

    const resolved = await this.claimants.resolveByVerifiedPhone(
      payload.sharedPhone,
      payload.channel
    );

    const verified = await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: {
        claimantId: resolved.claimantId,
        tenantId: resolved.tenantId ?? null,
        verifiedAt: new Date(),
        pendingPhone: null,
      },
    });

    await this.say(adapter, binding.id, payload.platformUserId, {
      text: 'Thank you. Let us begin.',
    });
    this.logger.log(
      `Binding ${binding.id} bound on ${payload.channel} via a platform-verified contact.`
    );

    // Carry straight on into the claim-type question.
    //
    // Returning here instead left the claimant told "let us begin your claim"
    // and asked nothing — the menu only fired on their *next* message, so the
    // conversation looked finished when it had barely started. Nothing errored,
    // which is what made it invisible: the bot had simply stopped talking.
    await this.requireConsentThenStart(messageId, payload, adapter, verified);
  }

  /**
   * Apply a verified claimant's turn to their active Case and ask what comes
   * next.
   *
   * The flow comes from `flows.forCase`, which honours the version pinned on
   * the Case. A Telegram turn and a browser turn on the same Case therefore
   * walk the same steps — the pin is only worth having if every renderer
   * respects it.
   */
  private async applyAnswer(
    messageId: string,
    payload: InboundTurnPayload,
    adapter: ChannelAdapter,
    binding: {
      id: string;
      activeCaseId: string | null;
      claimantId: string | null;
      tenantId: string | null;
      locale?: string | null;
    }
  ): Promise<void> {
    if (!binding.activeCaseId) {
      await this.requireConsentThenStart(messageId, payload, adapter, binding);
      return;
    }

    const caseRow = await this.prisma.case.findUnique({ where: { id: binding.activeCaseId } });
    if (!caseRow) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: { status: ConversationMessageStatus.FAILED, error: 'Active case not found' },
      });
      return;
    }

    // The same structure, worded for this channel and this claimant's
    // language. Structure is never overlaid — a Telegram conversation and a
    // browser one on the same Case walk identical steps.
    const flow = await this.flows.forCase(caseRow, {
      channel: payload.channel,
      locale: noticeLocale(binding.locale),
    });
    const step = caseRow.currentStepId ? getStep(flow, caseRow.currentStepId) : null;
    if (!step) {
      // The active claim has no question left. Release the binding and offer a
      // fresh one rather than dead-ending.
      //
      // Without this a claimant could file exactly one claim, ever: activeCaseId
      // stayed pinned to the finished Case and every later message got "nothing
      // further to answer here" — a permanent dead end that reads as the bot
      // being broken. People travel more than once.
      await this.prisma.conversationBinding.update({
        where: { id: binding.id },
        data: { activeCaseId: null },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: `Your claim request ${caseRow.caseNumber} is with our team. Would you like to start another claim?`,
      });
      await this.requireConsentThenStart(messageId, payload, adapter, binding);
      return;
    }

    // "More options" on a long choice list — navigation, not an answer.
    if (payload.callbackValue?.startsWith(PAGE_CALLBACK_PREFIX)) {
      const page = Number(payload.callbackValue.slice(PAGE_CALLBACK_PREFIX.length)) || 0;
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: { status: ConversationMessageStatus.PROCESSED, stepId: step.id, processedAt: new Date() },
      });
      await this.ask(adapter, binding.id, payload.platformUserId, step, page);
      return;
    }

    // A document step wants a file, and the answer it stores is the resulting
    // CaseDocument id — the same upload-then-answer sequence as the PWA, so
    // the evidence checklist and the flow agree about what has been supplied.
    // A tapped button beats typed text: it carries the stored value directly
    // and needs no interpretation.
    const raw = payload.callbackValue ?? payload.text;
    const answers = caseRow.answers as CaseAnswers;

    // Corrections come before anything else interprets the message.
    //
    // The flow assumed a claimant who never mistypes. In practice most of a
    // real intake is error recovery, and until now a wrong answer was
    // permanent — the cursor only ever moved forwards.
    const word = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

    if (BACK_WORDS.has(word)) {
      await this.reopenStep(messageId, payload, adapter, binding, caseRow, flow, step.id, true);
      return;
    }

    if (EDIT_WORDS.has(word)) {
      await this.offerEditMenu(messageId, payload, adapter, binding, flow, answers);
      return;
    }

    // A question is not an answer. "What is a PIR?" was being stored as the
    // answer to the step that asked for one — the claimant gets no help, and
    // an adjuster later reads a document reference that is actually a question.
    if (this.looksLikeAQuestion(word, step)) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.UNPARSEABLE,
          stepId: step.id,
          processedAt: new Date(),
        },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          'That looks like a question rather than an answer. If you are unsure, type "human" ' +
          'and one of our team will help — otherwise here is the question again.',
      });
      await this.ask(adapter, binding.id, payload.platformUserId, step);
      return;
    }

    // Asking for a person, at any point. Nothing about intake should trap
    // someone who wants to speak to somebody.
    if (HUMAN_WORDS.has(word)) {
      await this.handOverToAgent(
        messageId,
        payload,
        adapter,
        binding,
        step.id,
        `Claimant asked for a person at "${step.label}"`
      );
      return;
    }

    if (typeof raw === 'string' && raw.startsWith(EDIT_CALLBACK_PREFIX)) {
      const target = raw.slice(EDIT_CALLBACK_PREFIX.length);
      await this.reopenStep(messageId, payload, adapter, binding, caseRow, flow, target, false);
      return;
    }

    // "Change something" at the review. There is no edit-a-single-answer flow,
    // and a button that quietly does nothing is worse than no button — so it
    // asks for a person, which is exactly what the inbox exists to serve.
    if (step.answerType === 'confirm' && raw === 'false') {
      await this.prisma.conversationBinding.update({
        where: { id: binding.id },
        data: {
          mode: ConversationMode.HANDOVER,
          handoverAt: new Date(),
          handoverReason: 'Claimant asked to change a detail at the review step',
          resolvedAt: null,
        },
      });
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.AWAITING_AGENT,
          stepId: step.id,
          processedAt: new Date(),
        },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          'No problem. Tell us what needs changing and one of our team will pick this up ' +
          'with you shortly.',
      });
      return;
    }

    // A tap meant for a question that has since moved on.
    //
    // Navigation callbacks have already returned above, so anything still here
    // is an answer — and an answer to the wrong question is worse than none.
    // The failure this closes: nothing acknowledged the tap, so the button
    // spun, the claimant tapped again, and the two taps produced two distinct
    // update ids that the dedupe could not connect. The first was applied and
    // advanced the cursor; the second landed on whatever came next. On the
    // opening menu that stored the claim type as the policy number — a
    // free-text step accepts anything — silently, on the first interaction.
    if (payload.callbackStepId && payload.callbackStepId !== step.id) {
      this.logger.log(
        `Ignoring a tap for "${payload.callbackStepId}"; the conversation is at "${step.id}".`
      );
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.UNPARSEABLE,
          stepId: step.id,
          error: `Stale tap for ${payload.callbackStepId}`,
          processedAt: new Date(),
        },
      });
      // Re-ask rather than apologise: from the claimant's side they tapped a
      // button twice and the conversation simply moved on, which is correct.
      await this.ask(adapter, binding.id, payload.platformUserId, step);
      return;
    }

    let value: string | number | boolean;
    if (step.answerType === 'document') {
      // An optional document the claimant does not have. The prompt invites
      // "skip" and `validateAnswer` accepts it, but this branch returned early
      // looking for a file and never reached either — so the luggage flow's
      // proof-of-ownership step could not be passed at all, and it sits just
      // before the bank details, which meant that whole flow could never reach
      // review over a messaging channel.
      if (!payload.mediaRef && step.optional && word === SKIP_VALUE) {
        value = SKIP_VALUE;
      } else if (!payload.mediaRef) {
        await this.prisma.conversationMessage.update({
          where: { id: messageId },
          data: { status: ConversationMessageStatus.UNPARSEABLE, stepId: step.id, processedAt: new Date() },
        });
        await this.say(adapter, binding.id, payload.platformUserId, {
          text: step.optional
            ? 'Please send the document as a photo or a file — or type "skip" if you do not have it.'
            : 'Please send the document as a photo or a file.',
        });
        return;
      } else {

      // Fetched only now — a claimant sending unrelated pictures earlier cost
      // nothing, because media is carried as a reference until a step wants it.
      const media = await adapter.fetchMedia(payload.mediaRef);
      const document = await this.cases.uploadDocument(
        caseRow.id,
        {
          toBuffer: async () => media.buffer,
          filename: media.filename,
          mimetype: media.mimeType,
          // Mirrors the multipart field shape the PWA posts.
          fields: {
            type: { value: step.documentType },
            stepId: { value: step.id },
          },
        },
        this.claimantContext(binding)
      );
      value = document.id;

      // Tie the turn to the file it produced, so the transcript can show the
      // photo rather than the word "Attachment". Recorded here because this is
      // the only moment both are in hand.
        await this.prisma.conversationMessage.update({
          where: { id: messageId },
          data: { caseDocumentId: document.id },
        });
      }
    } else {
      if (raw === undefined) {
        await this.prisma.conversationMessage.update({
          where: { id: messageId },
          data: { status: ConversationMessageStatus.UNPARSEABLE, stepId: step.id, processedAt: new Date() },
        });
        await this.ask(adapter, binding.id, payload.platformUserId, step);
        return;
      }
      if (step.answerType === 'date' || step.answerType === 'datetime') {
        // No messaging platform has a date control, so the claimant typed this
        // in the day-first form the prompt asked for. Converting to ISO here is
        // what makes the hint and the validator agree — they did not, and the
        // conversation looped: the bot asked for DD/MM/YYYY, the claimant sent
        // exactly that, and the shared validator rejected it.
        const capabilities = adapter.capabilities ?? CHANNEL_CAPABILITIES[adapter.channel];
        if (capabilities?.dateEntry === 'text') {
          const iso = parseTextDate(String(raw), step.answerType);
          if (!iso) {
            await this.prisma.conversationMessage.update({
              where: { id: messageId },
              data: {
                status: ConversationMessageStatus.UNPARSEABLE,
                stepId: step.id,
                processedAt: new Date(),
              },
            });
            await this.say(adapter, binding.id, payload.platformUserId, {
              text:
                step.answerType === 'date'
                  ? 'Sorry, I could not read that date. Please write it as DD/MM/YYYY — for example 16/06/2026.'
                  : 'Sorry, I could not read that. Please write it as DD/MM/YYYY HH:MM — for example 16/06/2026 14:30.',
            });
            return;
          }
          value = iso;
        } else {
          value = raw;
        }
      } else {
        value = step.answerType === 'number' ? Number(raw) : raw;
      }
    }

    // Routed through the same method the PWA calls, deliberately. It carries
    // the redaction of sensitive answers, policy promotion, deadline warnings
    // and the audit entry — a separate write path here would drift from all
    // four, and the first thing to break silently would be the masking of the
    // bank account number.
    //
    // It also enforces access: assertAccess requires the Case to belong to
    // this claimant, so a Telegram sender provably cannot reach anyone else's
    // claim, checked by the same code as the browser.
    // Remember what they typed, so we can show how it was read if the two
    // differ. A date parsed day-first and stored as ISO is invisible to the
    // claimant otherwise — and a month-day swap moves the CSP deadline flags.
    const typed = typeof raw === 'string' ? raw.trim() : String(raw);

    // Deterministic parsing has had its go. If the value still will not pass,
    // ask the model to read it — and only then.
    //
    // Fallback-only, deliberately. Running a model on every turn would put a
    // paid offshore call on the hot path of every RM10 travel claim, which
    // §2.5 rules out, and would spend the compliance position that a purely
    // rule-based intake currently sits outside AI-governance scope.
    //
    // What comes back is a *value*, not a decision. It goes through the same
    // patchAnswer, the same validateAnswer, the same audit row. The model
    // never chooses the next question.
    if (this.normaliser.isEnabled() && !validateAnswer(step, value).valid) {
      const interpreted = await this.normaliser.normalise(String(raw ?? ''), step, {
        claimId: caseRow.id,
        claimantId: binding.claimantId,
        tenantId: caseRow.tenantId,
      });
      if (interpreted !== null && validateAnswer(step, interpreted).valid) {
        this.logger.log(`Step ${step.id}: model read "${raw}" as "${interpreted}".`);
        value = interpreted;
      }
    }

    const result = await this.cases.patchAnswer(
      caseRow.id,
      { stepId: step.id, value },
      this.claimantContext(binding)
    );

    if (!result.accepted) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: { status: ConversationMessageStatus.UNPARSEABLE, stepId: step.id, processedAt: new Date() },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: result.error ?? 'Sorry, that does not look right.',
      });
      await this.ask(adapter, binding.id, payload.platformUserId, step);
      return;
    }

    await this.prisma.conversationMessage.update({
      where: { id: messageId },
      data: {
        status: ConversationMessageStatus.PROCESSED,
        stepId: step.id,
        processedAt: new Date(),
        // Now that the step is known, the transcript can carry the wording
        // that was actually on the button rather than the enum behind it —
        // "Illness or injury", not ILLNESS. Only for taps: a typed answer is
        // already the claimant's own words and must not be rewritten.
        //
        // Except where those words are a payout account. The Case answer bag
        // masks it, and the encrypted column holds the real value — but the
        // claimant *typed* it, so the transcript kept a plaintext copy in a
        // column that is neither encrypted, nor omitted from query results,
        // nor reached by the retention sweep or the anonymisation job, and is
        // readable by any adjuster or support-desk user in the tenant. The
        // mask is what the operator needs to see anyway.
        ...(SENSITIVE_ANSWER_STEPS.has(step.id)
          ? { text: maskForTranscript(typed) }
          : payload.callbackValue
            ? { text: describeCallbackValue(payload.callbackValue, step.choices) }
            : {}),
      },
    });

    // Show what we understood, where it is not obviously the same thing they
    // typed. Only on the ambiguous types, and only when the stored value
    // actually differs — echoing "MH370 → MH370" is noise that trains people
    // to stop reading.
    const echo = this.confirmationOf(step, typed, value);
    if (echo) {
      await this.say(adapter, binding.id, payload.platformUserId, { text: echo });
    }

    // Deadline warnings are advisory by design (MASTER_PLAN §3.2) — a late
    // notification is recorded and flagged, never refused. The claimant must
    // still be told, on whichever channel they used.
    for (const warning of result.warnings ?? []) {
      await this.say(adapter, binding.id, payload.platformUserId, { text: warning });
    }

    // A correction has been saved: go back to where they were interrupted
    // rather than re-walking everything after the step they fixed.
    if (caseRow.resumeStepId) {
      const resumeStep = getStep(flow, caseRow.resumeStepId);
      await this.prisma.case.update({
        where: { id: caseRow.id },
        data: { currentStepId: caseRow.resumeStepId, resumeStepId: null },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: `\u2713 Updated "${step.label}".`,
      });
      if (resumeStep) {
        await this.ask(adapter, binding.id, payload.platformUserId, resumeStep, 0, {
          steps: flow.steps,
          answers: (result.case?.answers ?? {}) as CaseAnswers,
        });
        return;
      }
    }

    if (!result.nextStep) {
      // The conversation has run out of steps. On this channel that means the
      // claimant just confirmed the review — so submit, here, now.
      //
      // Previously this said "submit your claim in the app", which was wrong
      // twice: a Telegram claimant has no app and was never told of one, and
      // nothing submitted the Case at all. It stayed IN_PROGRESS and never
      // reached the operator vetting queue — a completed intake that no human
      // would ever see.
      const submitted = await this.cases.submit(caseRow.id, this.claimantContext(binding));
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          `Thank you — your claim request ${submitted.caseNumber} has been submitted. ` +
          'Our team will review it and contact you if anything further is needed.',
      });
      return;
    }

    await this.ask(
      adapter,
      binding.id,
      payload.platformUserId,
      result.nextStep,
      0,
      // Give the next step the material for a summary, in case it is the review.
      { steps: flow.steps, answers: (result.case?.answers ?? {}) as CaseAnswers },
      this.progressOf(flow, result.nextStep.id)
    );
  }

  /**
   * A claimant identity for the binding, so channel turns reuse the PWA's
   * access checks rather than a second, weaker set.
   */
  private claimantContext(binding: { claimantId: string | null; tenantId: string | null }): TenantContext {
    return {
      tenantId: binding.tenantId ?? '',
      userId: binding.claimantId ?? '',
      userRole: 'CLAIMANT',
      scope: TenantScope.STRICT,
      allowCrossTenant: false,
    };
  }

  /**
   * Show the approved consent notice, and open a Case only once it is agreed.
   *
   * Consent is a precondition for processing, not a question in the flow — so
   * it sits here in code rather than in a FlowDefinition an author could edit.
   * `CasesService.create` refuses without it regardless, which is what makes
   * this channel-proof; this method is how a Telegram claimant is actually
   * given the chance to agree.
   *
   * The wording comes from the approved ConsentNotice, never from copy written
   * here. Consent recorded against unapproved or ad-hoc wording is unprovable
   * later, which is the whole reason notices are versioned and immutable.
   */
  private async requireConsentThenStart(
    messageId: string,
    payload: InboundTurnPayload,
    adapter: ChannelAdapter,
    binding: { id: string; claimantId: string | null; tenantId: string | null; locale?: string | null }
  ): Promise<void> {
    if (!binding.claimantId) {
      this.logger.error(`Binding ${binding.id} is verified but has no claimant; cannot proceed.`);
      return;
    }

    if (await this.consent.hasConsent(binding.claimantId, ConsentPurpose.CLAIM_PROCESSING)) {
      await this.startCase(messageId, payload, adapter, binding);
      return;
    }

    // Agreement arrives as the callback from the button below.
    if (payload.callbackValue === CONSENT_AGREED) {
      await this.consent.grant({
        claimantId: binding.claimantId,
        purpose: ConsentPurpose.CLAIM_PROCESSING,
        capturedVia: ConsentChannel.MESSAGING,
        // Tied to the wording they were actually shown. A consent recorded
        // against a version the claimant never read is unprovable later,
        // which is the whole reason notices are versioned and immutable.
        locale: noticeLocale(binding.locale),
      });
      this.logger.log(`Consent captured on ${payload.channel} for claimant ${binding.claimantId}.`);
      await this.startCase(messageId, payload, adapter, binding);
      return;
    }

    // In the claimant's own language. The approval gate already requires both
    // English and Bahasa Malaysia to exist before a version can be approved
    // (PDPA s.7), and until now the Malay one was written, reviewed, approved
    // — and never shown to anybody, because this call hardcoded 'en'.
    const notice = await this.consent.currentNotice(
      ConsentPurpose.CLAIM_PROCESSING,
      noticeLocale(binding.locale)
    );
    if (!notice) {
      // Refuse rather than proceed. Taking a claim with no approved wording to
      // record against is the failure this whole gate exists to prevent.
      this.logger.error('No approved CLAIM_PROCESSING notice; refusing to start intake.');
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'Sorry — we cannot start a claim just now. Please contact our support desk.',
      });
      return;
    }

    await this.prisma.conversationMessage.updateMany({
      where: { id: messageId, status: ConversationMessageStatus.PENDING },
      data: { status: ConversationMessageStatus.PROCESSED, processedAt: new Date() },
    });

    // Sent as a choice step so the adapter renders it through its normal
    // keyboard path — and so both the wording and the reply agreeing to it
    // land in the conversation transcript, which is the evidence.
    await this.say(adapter, binding.id, payload.platformUserId, {
      text: `${notice.title}\n\n${notice.body}`,
      step: {
        id: '__consent',
        prompt: notice.title,
        label: 'Consent',
        answerType: 'choice',
        choices: [{ value: CONSENT_AGREED, label: 'I agree' }],
        next: { type: 'end' },
      },
    });
  }

  /**
   * Offer the claim types, and open a Case once one is chosen.
   *
   * The menu is a synthetic choice step rather than hand-built buttons, so the
   * adapter renders it through exactly the same path as a real choice question
   * — including the pagination rule. A separate rendering path here would be
   * the first place a channel's keyboard conventions started to diverge.
   */
  private async startCase(
    messageId: string,
    payload: InboundTurnPayload,
    adapter: ChannelAdapter,
    binding: { id: string; claimantId: string | null; tenantId: string | null }
  ): Promise<void> {
    const chosen =
      payload.callbackValue && payload.callbackValue in TRAVEL_CLAIM_TYPE_LABELS
        ? (payload.callbackValue as TravelClaimType)
        : null;

    if (!chosen) {
      // updateMany with a PENDING guard, not update: this runs both as its own
      // turn and as the tail of onboarding, and the OTP message it would
      // otherwise relabel is genuinely ONBOARDING, not a flow answer.
      await this.prisma.conversationMessage.updateMany({
        where: { id: messageId, status: ConversationMessageStatus.PENDING },
        data: { status: ConversationMessageStatus.PROCESSED, processedAt: new Date() },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'What has happened? Choose the option that fits best.',
        step: this.claimTypeMenu(),
      });
      return;
    }

    const created = await this.cases.create(
      {
        travelClaimType: chosen,
        channel: CaseChannel.TELEGRAM,
        initiatedBy: CaseInitiator.CLAIMANT,
      } as CreateCaseDto,
      this.claimantContext(binding)
    );

    await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: { activeCaseId: created.id, tenantId: created.tenantId },
    });

    await this.prisma.conversationMessage.update({
      where: { id: messageId },
      data: { status: ConversationMessageStatus.PROCESSED, processedAt: new Date() },
    });

    await this.say(adapter, binding.id, payload.platformUserId, {
      text: `Your claim request ${created.caseNumber} has been started. A few questions and we are done.`,
    });

    // create() returns the resolved current step, so no second lookup.
    if (created.currentStep) {
      await this.ask(adapter, binding.id, payload.platformUserId, created.currentStep);
    }
  }

  /** The claim-type chooser, shaped as a flow step so adapters render it normally. */
  private claimTypeMenu(): FlowStep {
    return {
      id: '__claim-type',
      prompt: 'What has happened?',
      label: 'Claim type',
      answerType: 'choice',
      choices: Object.entries(TRAVEL_CLAIM_TYPE_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
      next: { type: 'end' },
    };
  }

  /**
   * Reopen a step so the claimant can answer it again.
   *
   * `isBack` distinguishes "undo what I just said" from "change that one over
   * there". Undo clears the answer to the *current* step, since the claimant
   * has not answered it yet and is stepping backwards past it.
   *
   * Where they return to afterwards depends on whether the step decides the
   * path. An ordinary field resumes exactly where they were interrupted. A
   * branch input cannot: changing it may make a later question necessary that
   * was never asked, or an answer already given irrelevant. So the conversation
   * re-walks from there, and says so rather than silently discarding work.
   */
  private async reopenStep(
    messageId: string,
    payload: InboundTurnPayload,
    adapter: ChannelAdapter,
    binding: { id: string; claimantId: string | null; tenantId: string | null },
    caseRow: { id: string; currentStepId: string | null; resumeStepId: string | null },
    flow: CaseFlow,
    targetStepId: string,
    isBack: boolean
  ): Promise<void> {
    const target = getStep(flow, targetStepId);
    if (!target) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'Sorry, I could not find that answer to change.',
      });
      return;
    }

    // Stepping back from the first question has nowhere to go.
    if (isBack && targetStepId === flow.entryStepId) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'This is the first question, so there is nothing before it to change.',
      });
      await this.ask(adapter, binding.id, payload.platformUserId, target);
      return;
    }

    const previousId = isBack ? this.previousAnsweredStep(flow, caseRow.currentStepId) : targetStepId;
    if (!previousId) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'There is nothing before this to change yet.',
      });
      return;
    }

    const stepToRedo = getStep(flow, previousId);
    if (!stepToRedo) return;

    const changesThePath = branchInputSteps(flow).has(previousId);

    await this.prisma.case.update({
      where: { id: caseRow.id },
      data: {
        currentStepId: previousId,
        // Nothing to resume to when the path itself may change — the flow will
        // walk forward normally and re-ask whatever the new answer requires.
        resumeStepId: changesThePath ? null : (caseRow.resumeStepId ?? caseRow.currentStepId),
      },
    });

    await this.prisma.conversationMessage.update({
      where: { id: messageId },
      data: {
        status: ConversationMessageStatus.PROCESSED,
        stepId: previousId,
        processedAt: new Date(),
      },
    });

    if (changesThePath) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          `Changing "${stepToRedo.label}" may affect what we need to ask afterwards, ` +
          'so we will carry on from there once you have answered.',
      });
    }

    await this.say(adapter, binding.id, payload.platformUserId, {
      text: `Let us redo "${stepToRedo.label}".`,
    });
    await this.ask(adapter, binding.id, payload.platformUserId, stepToRedo);
  }

  /** The last step before `fromStepId` that the claimant actually answered. */
  private previousAnsweredStep(flow: CaseFlow, fromStepId: string | null): string | null {
    const order = flow.steps.map(step => step.id);
    const index = fromStepId ? order.indexOf(fromStepId) : order.length;
    if (index <= 0) return null;
    return order[index - 1];
  }

  /**
   * Offer the answers so far as tappable buttons.
   *
   * Showing the current value on each button matters more than it looks: a
   * claimant hunting a typo needs to see which one is wrong, and "Destination"
   * alone does not tell them. "Destination — SG" does.
   */
  private async offerEditMenu(
    messageId: string,
    payload: InboundTurnPayload,
    adapter: ChannelAdapter,
    binding: { id: string },
    flow: CaseFlow,
    answers: CaseAnswers
  ): Promise<void> {
    const choices = flow.steps
      .filter(step => step.answerType !== 'confirm' && answers[step.id] !== undefined)
      .map(step => {
        const value = answers[step.id];
        const shown =
          step.answerType === 'document'
            ? 'provided'
            : step.answerType === 'choice'
              ? (step.choices?.find(choice => choice.value === value)?.label ?? String(value))
              : String(value);
        return {
          value: `${EDIT_CALLBACK_PREFIX}${step.id}`,
          label: `${step.label} — ${shown}`.slice(0, 60),
        };
      });

    await this.prisma.conversationMessage.update({
      where: { id: messageId },
      data: { status: ConversationMessageStatus.PROCESSED, processedAt: new Date() },
    });

    if (choices.length === 0) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'You have not answered anything yet, so there is nothing to change.',
      });
      return;
    }

    await this.say(adapter, binding.id, payload.platformUserId, {
      text: 'Which detail would you like to change?',
      step: {
        id: '__edit-menu',
        prompt: 'Which detail would you like to change?',
        label: 'Change a detail',
        answerType: 'choice',
        choices,
        next: { type: 'end' },
      },
    });
  }

  /**
   * Where this step sits in the flow.
   *
   * Counted over the whole definition rather than the path actually taken: a
   * branch means the true total is not knowable until the end, and a total
   * that shrinks mid-conversation reads as a bug. Slightly pessimistic and
   * stable beats accurate and jumpy.
   */
  private progressOf(flow: CaseFlow, stepId: string): { position: number; total: number } {
    const asked = flow.steps.filter(step => step.answerType !== 'confirm');
    const index = asked.findIndex(step => step.id === stepId);
    return { position: index >= 0 ? index + 1 : asked.length, total: asked.length };
  }

  /**
   * A one-line "this is what I recorded", where the reading could be wrong.
   *
   * Restricted to the types where interpretation happens — dates, times and
   * amounts. Everything else is stored as typed, so confirming it back says
   * nothing and costs a message.
   */
  private confirmationOf(
    step: FlowStep,
    typed: string,
    stored: string | number | boolean
  ): string | null {
    if (String(stored) === typed) return null;

    if (step.answerType === 'date' || step.answerType === 'datetime') {
      const parsed = new Date(String(stored));
      if (Number.isNaN(parsed.getTime())) return null;
      const shown = parsed.toLocaleString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        ...(step.answerType === 'datetime' ? { hour: '2-digit', minute: '2-digit' } : {}),
        timeZone: 'UTC',
      });
      // Spelled month, deliberately: "16/06" and "06/16" look alike and that
      // ambiguity is the exact thing being confirmed.
      return `Recorded as ${shown}. Type "back" if that is not right.`;
    }

    if (step.answerType === 'number') {
      return `Recorded as RM ${Number(stored).toLocaleString('en-MY')}. Type "back" if that is not right.`;
    }

    return null;
  }

  /**
   * Whether a message reads as a question rather than an answer.
   *
   * Deliberately narrow: a leading interrogative *and* a question mark, and
   * never on steps where a question mark could belong to a real answer. A
   * false positive here refuses a valid answer and leaves the claimant with no
   * idea what we wanted, which is worse than storing one odd value.
   */
  private looksLikeAQuestion(word: string, step: FlowStep): boolean {
    if (!word || step.answerType === 'document' || step.answerType === 'confirm') return false;
    // Free text can legitimately contain a question mark — a damage
    // description might. Only the short, clearly-interrogative ones qualify.
    if (word.length > 80) return false;
    if (!word.includes('?')) return false;
    return /^(what|which|why|how|who|when|where|is |are |do |does |can |apa|kenapa|macam)/.test(
      word
    );
  }

  /** Put the conversation in front of a person, with the reason recorded. */
  private async handOverToAgent(
    messageId: string,
    payload: InboundTurnPayload,
    adapter: ChannelAdapter,
    binding: { id: string },
    stepId: string,
    reason: string
  ): Promise<void> {
    await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: {
        mode: ConversationMode.HANDOVER,
        handoverAt: new Date(),
        handoverReason: reason,
        resolvedAt: null,
      },
    });
    await this.prisma.conversationMessage.update({
      where: { id: messageId },
      data: {
        status: ConversationMessageStatus.AWAITING_AGENT,
        stepId,
        processedAt: new Date(),
      },
    });
    await this.say(adapter, binding.id, payload.platformUserId, {
      text: 'Of course — one of our team will pick this up with you shortly.',
    });
  }

  /** Put one step to the claimant, degraded to what this channel can render. */
  private async ask(
    adapter: ChannelAdapter,
    bindingId: string | null,
    platformUserId: string,
    step: FlowStep,
    page = 0,
    review?: { steps: FlowStep[]; answers: CaseAnswers },
    progress?: { position: number; total: number }
  ): Promise<void> {
    // Position first, so a claimant knows how much is left before reading the
    // question. Eighteen questions with no end in sight is how intake gets
    // abandoned halfway.
    let text = progress ? `(${progress.position} of ${progress.total}) ${step.prompt}` : step.prompt;

    // A channel with no date control gets an explicit format hint, because the
    // claimant is about to type free text that has to parse.
    const capabilities = adapter.capabilities ?? CHANNEL_CAPABILITIES[adapter.channel];
    if (
      capabilities?.dateEntry === 'text' &&
      (step.answerType === 'date' || step.answerType === 'datetime')
    ) {
      text += step.answerType === 'date' ? '\n\nPlease use DD/MM/YYYY.' : '\n\nPlease use DD/MM/YYYY HH:MM.';
    }

    if (step.answerType === 'document' && capabilities?.document === 'link_out') {
      text += '\n\nPlease upload this document in the app.';
    }

    // A confirm step on a channel with nowhere to put a summary must carry the
    // answers in the message. Otherwise the claimant is asked to agree to
    // details they cannot see — and what they are agreeing to is a claim
    // submission.
    if (step.answerType === 'confirm' && review && capabilities?.summaryPanel === false) {
      const summary = summariseAnswers(review.steps, review.answers);
      if (summary) text += `\n\n${summary}`;
    }

    // A correction feature nobody knows about does not exist. Kept to one
    // short line rather than repeated instructions, and only on steps a
    // claimant types into — a tapped button is not where typos happen.
    if (step.answerType !== 'confirm' && step.answerType !== 'choice') {
      text += '\n\nType "back" to change your last answer, or "edit" to change any of them.';
    }

    await this.say(adapter, bindingId, platformUserId, { text, step, choicePage: page });
  }

  /**
   * The single outbound path. Everything the firm says to a claimant goes
   * through here, and is persisted before it is sent.
   *
   * A funnel rather than a write at each of the fifteen call sites, because the
   * one that gets forgotten is invisible: the claimant sees the message, the
   * transcript does not, and an operator reviewing the conversation reads a
   * question that appears to have been answered before it was asked.
   *
   * `sentByUserId` is null for the bot and set for an operator. That single
   * column is what makes bot performance reviewable at all — otherwise the
   * machine's words and a human's are indistinguishable after the fact.
   */
  private async say(
    adapter: ChannelAdapter,
    bindingId: string | null,
    platformUserId: string,
    prompt: OutboundPrompt,
    sentByUserId?: string
  ): Promise<void> {
    // Persisted first, for the same reason inbound is: a send that throws
    // half-way must still leave evidence that we tried to say something.
    const record = await this.prisma.conversationMessage.create({
      data: {
        channel: adapter.channel,
        direction: MessageDirection.OUTBOUND,
        bindingId,
        text: prompt.text,
        stepId: prompt.step?.id ?? null,
        sentByUserId: sentByUserId ?? null,
        status: ConversationMessageStatus.PENDING,
      },
    });

    try {
      await adapter.send(platformUserId, prompt);
      await this.prisma.conversationMessage.update({
        where: { id: record.id },
        data: { status: ConversationMessageStatus.PROCESSED, processedAt: new Date() },
      });
    } catch (error) {
      await this.prisma.conversationMessage.update({
        where: { id: record.id },
        data: { status: ConversationMessageStatus.FAILED, error: (error as Error).message },
      });
      throw error;
    }
  }

  /**
   * Send a message an operator typed, as the firm.
   *
   * Public because the conversations API calls it. Routed through `say` so an
   * agent's message is persisted, attributed and traceable exactly like the
   * bot's — the transcript is the record of what the claimant was told, and it
   * does not care who typed it.
   */
  async sendAsOperator(
    bindingId: string,
    channel: CaseChannel,
    platformUserId: string,
    text: string,
    userId: string
  ): Promise<void> {
    const adapter = this.adapterFor(channel);
    if (!adapter) throw new Error(`No adapter registered for ${channel}`);
    await this.say(adapter, bindingId, platformUserId, { text }, userId);
  }

  /** Send without letting a delivery failure mask the original error. */
  private async safeSend(
    adapter: ChannelAdapter,
    platformUserId: string,
    prompt: { text: string }
  ): Promise<void> {
    try {
      await adapter.send(platformUserId, prompt);
    } catch (error) {
      this.logger.error(`Could not notify ${platformUserId}: ${(error as Error).message}`);
    }
  }


}
