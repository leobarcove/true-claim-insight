import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  CaseChannel,
  CaseInitiator,
  ConversationMessageStatus,
  ConversationMode,
  MessageDirection,
  Prisma,
  TravelClaimType,
} from '@prisma/client';
import {
  CHANNEL_CAPABILITIES,
  getStep,
  parseTextDate,
  TRAVEL_CLAIM_TYPE_LABELS,
  validateAnswer,
  type FlowStep,
} from '@tci/shared-types';
import { PrismaService } from '../config/prisma.service';
import { CasesService } from '../cases/cases.service';
import type { CreateCaseDto } from '../cases/dto/create-case.dto';
import { FlowsService } from '../cases/flows.service';
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
import { OTP_VERIFIER, type OtpVerifier } from './otp-verifier.interface';

/** Rejected after this many wrong codes, so a stranger cannot grind a phone. */
const MAX_OTP_ATTEMPTS = 5;

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly flows: FlowsService,
    @Inject(OTP_VERIFIER) private readonly otp: OtpVerifier,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapter[],
    @Inject(ANSWER_NORMALISER) private readonly normaliser: AnswerNormaliser
  ) {}

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
          text: payload.text ?? null,
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
      update: { lastSeenAt: new Date() },
      create: {
        channel: payload.channel,
        platformUserId: payload.platformUserId,
      },
    });

    await this.prisma.conversationMessage.update({
      where: { id: messageId },
      data: { bindingId: binding.id },
    });

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
   * Phone share, then one-time code.
   *
   * Telegram's request_contact supplies a number the platform already
   * verified, which spares the claimant typing it — but the code is still
   * sent, because platform verification happened at signup and proves nothing
   * about who holds the handset today.
   */
  private async runOnboarding(
    messageId: string,
    payload: InboundTurnPayload,
    adapter: ChannelAdapter,
    binding: { id: string; pendingPhone: string | null; otpAttempts: number }
  ): Promise<void> {
    await this.prisma.conversationMessage.update({
      where: { id: messageId },
      data: { status: ConversationMessageStatus.ONBOARDING, processedAt: new Date() },
    });

    const phone = payload.sharedPhone ?? this.asPhone(payload.text);

    // A phone arriving at any point restarts verification for that number.
    if (phone && phone !== binding.pendingPhone) {
      await this.prisma.conversationBinding.update({
        where: { id: binding.id },
        data: { pendingPhone: phone, otpAttempts: 0 },
      });
      await this.otp.send(phone);
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: `Thank you. We have sent a 6-digit code to ${phone}. Please reply with the code to continue.`,
      });
      return;
    }

    if (!binding.pendingPhone) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          'Welcome to True Claim Insight. Before we begin, we need to confirm who you are. ' +
          'Please share your mobile number.',
        requestPhone: true,
      });
      return;
    }

    const code = this.asOtpCode(payload.text);
    if (!code) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: `Please reply with the 6-digit code we sent to ${binding.pendingPhone}.`,
      });
      return;
    }

    if (binding.otpAttempts >= MAX_OTP_ATTEMPTS) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          'Too many incorrect codes. For your security this conversation is paused — ' +
          'please contact our support desk to continue.',
      });
      return;
    }

    const result = await this.otp.verify(binding.pendingPhone, code);
    if (!result.valid) {
      await this.prisma.conversationBinding.update({
        where: { id: binding.id },
        data: { otpAttempts: { increment: 1 } },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'That code was not correct or has expired. Please check and try again.',
      });
      return;
    }

    const verified = await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: {
        claimantId: result.claimantId ?? null,
        tenantId: result.tenantId ?? null,
        verifiedAt: new Date(),
        otpAttempts: 0,
        pendingPhone: null,
      },
    });

    await this.say(adapter, binding.id, payload.platformUserId, {
      text: 'Thank you, you are verified.',
    });
    this.logger.log(`Binding ${binding.id} verified on ${payload.channel}.`);

    // Carry straight on into the claim-type question.
    //
    // Returning here instead left the claimant told "let us begin your claim"
    // and asked nothing — the menu only fired on their *next* message, so the
    // conversation looked finished when it had barely started. Nothing errored,
    // which is what made it invisible: the bot had simply stopped talking.
    await this.startCase(messageId, payload, adapter, verified);
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
    binding: { id: string; activeCaseId: string | null; claimantId: string | null; tenantId: string | null }
  ): Promise<void> {
    if (!binding.activeCaseId) {
      await this.startCase(messageId, payload, adapter, binding);
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

    const flow = await this.flows.forCase(caseRow);
    const step = caseRow.currentStepId ? getStep(flow, caseRow.currentStepId) : null;
    if (!step) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: { status: ConversationMessageStatus.PROCESSED, processedAt: new Date() },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'Your claim request is complete — there is nothing further to answer here.',
      });
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

    let value: string | number | boolean;
    if (step.answerType === 'document') {
      if (!payload.mediaRef) {
        await this.prisma.conversationMessage.update({
          where: { id: messageId },
          data: { status: ConversationMessageStatus.UNPARSEABLE, stepId: step.id, processedAt: new Date() },
        });
        await this.say(adapter, binding.id, payload.platformUserId, {
          text: 'Please send the document as a photo or a file.',
        });
        return;
      }

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
      data: { status: ConversationMessageStatus.PROCESSED, stepId: step.id, processedAt: new Date() },
    });

    // Deadline warnings are advisory by design (MASTER_PLAN §3.2) — a late
    // notification is recorded and flagged, never refused. The claimant must
    // still be told, on whichever channel they used.
    for (const warning of result.warnings ?? []) {
      await this.say(adapter, binding.id, payload.platformUserId, { text: warning });
    }

    if (!result.nextStep) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'That is everything we need. Please review and submit your claim in the app.',
      });
      return;
    }

    await this.ask(adapter, binding.id, payload.platformUserId, result.nextStep);
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

  /** Put one step to the claimant, degraded to what this channel can render. */
  private async ask(
    adapter: ChannelAdapter,
    bindingId: string | null,
    platformUserId: string,
    step: FlowStep,
    page = 0
  ): Promise<void> {
    let text = step.prompt;

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

  /** Malaysian mobile in any of the forms people actually type. */
  private asPhone(text?: string): string | undefined {
    if (!text) return undefined;
    const digits = text.replace(/[\s()-]/g, '');
    return /^(\+?60|0)\d{8,10}$/.test(digits) ? digits : undefined;
  }

  private asOtpCode(text?: string): string | undefined {
    if (!text) return undefined;
    const digits = text.replace(/\D/g, '');
    return digits.length === 6 ? digits : undefined;
  }
}
