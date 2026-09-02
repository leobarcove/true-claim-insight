import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CaseChannel,
  CaseInitiator,
  CaseStatus,
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
  ANOTHER_CLAIM_YES,
  ANOTHER_CLAIM_NO,
  EDIT_CANCEL_VALUE,
  EDIT_CALLBACK_PREFIX,
  getStep,
  formatDateAnswer,
  missingSteps,
  parseAmount,
  parseTextDate,
  ANSWER_MASK_PREFIX,
  SENSITIVE_ANSWER_STEPS,
  SHARED_MEDIA_DESCRIPTION,
  SHARED_PHONE_DESCRIPTION,
  DEFER_VALUE,
  SKIP_VALUE,
  summariseAnswers,
  TRAVEL_CLAIM_TYPE_LABELS,
  RESUME_CASE_CALLBACK_PREFIX,
  REVIEW_STEP_ID,
  validateAnswer,
  whatYouWillNeed,
  type CaseAnswers,
  type CaseFlow,
  type FlowStep,
} from '@tci/shared-types';
import { TransferRegister, type OffshoreProviderKey } from '@tci/prisma-client';
import { PrismaService } from '../config/prisma.service';
import { CasesService } from '../cases/cases.service';
import { InfoRequestEvents } from '../cases/info-request-events';
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
import { PHONE_VERIFIER, type PhoneVerifier } from './phone-verifier.interface';
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

/**
 * Asking for a person. Nothing in intake should trap someone who wants one.
 *
 * `help` and `support` are deliberately NOT here. They are what a confused
 * claimant types first, and routing them straight to handover put the
 * conversation in a queue that, for an unstaffed TPA out of hours, is
 * indefinite silence — the bot stops answering and nobody replaces it. Asking
 * for guidance and asking for a person are different requests.
 */
const HUMAN_WORDS = new Set(['human', 'agent', '/human', 'ejen']);

/** Asking what to do — answered here, with a person offered rather than forced. */
const HELP_WORDS = new Set(['help', 'support', '/help', 'bantuan', 'tolong']);

/**
 * Wrong codes a binding may offer before its pending number is discarded.
 *
 * Six digits is one-in-a-million per guess — ample against a person, nothing
 * against a script. The cap is what makes the difference, not the entropy.
 */
const MAX_CODE_ATTEMPTS = 5;

/**
 * A phone number as a claimant types it, reduced to E.164-ish digits.
 *
 * Deliberately strict about length rather than clever about formatting: this
 * decides whether a message is a phone number or something else entirely, and
 * reading "123456" as a number would swallow the verification code typed on
 * the very next turn. Returns null when it is not confidently a number.
 */
function normalisePhone(text: string): string | null {
  const trimmed = text.trim();
  // Letters mean prose, not a number — "my number is 012..." is handled by the
  // digits below, but "yes" or a date must never look like a phone number.
  const digits = trimmed.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const bare = digits.replace(/^\+/, '');
  // Malaysian mobiles are 9–11 digits after the country code; allow 8–15 to
  // cover the region without accepting a six-digit code.
  if (bare.length < 8 || bare.length > 15) return null;
  if (digits.startsWith('+')) return `+${bare}`;
  // Local form: 012… → +6012…
  if (bare.startsWith('0')) return `+60${bare.slice(1)}`;
  if (bare.startsWith('60')) return `+${bare}`;
  return `+${bare}`;
}

/**
 * Agreement and refusal at a confirm step, typed rather than tapped.
 *
 * Whole messages only, as with BACK_WORDS. Malay included, and "betul"/"setuju"
 * because that is what a Malaysian claimant types to agree.
 *
 * Deliberately narrow: these convert to the button values, and the review
 * button submits a claim. A loose match here would submit somebody's claim
 * because they typed a word containing "ok".
 */
const CONFIRM_WORDS = new Set([
  'yes',
  'y',
  'confirm',
  'confirmed',
  'submit',
  'ok',
  'okay',
  'okey',
  'correct',
  'agree',
  'yep',
  'yeah',
  'sure',
  'proceed',
  'done',
  'ya',
  'yer',
  'betul',
  'setuju',
  'sah',
  'hantar',
  'ok ok',
]);

/** Refusal at a confirm step — routes to the "change something" branch. */
const DECLINE_WORDS = new Set([
  'no',
  'n',
  'nope',
  'wrong',
  'incorrect',
  'change',
  'not correct',
  'tidak',
  'tak',
  'salah',
  'bukan',
]);

/**
 * Opening pleasantries, which are not an answer to anything.
 *
 * People returning to a conversation after a day say hello before they say
 * anything else — and a claimant mid-intake who typed "Hi" got back "Sorry, we
 * could not read that date", because the greeting was fed straight to the date
 * parser. That reply is confusing on its own terms and it reads as a broken
 * bot, which is exactly when someone abandons a claim.
 *
 * Whole messages only, like BACK_WORDS: "hi" alone is a greeting, "hi there I
 * fell on 16 June" is an answer and must reach the parser intact.
 */
const GREETING_WORDS = new Set([
  'hi',
  'hello',
  'hey',
  'helo',
  'yo',
  'hai',
  'halo',
  'good morning',
  'good afternoon',
  'good evening',
  'morning',
  'salam',
  'assalamualaikum',
  'selamat pagi',
  'selamat petang',
  'apa khabar',
  'ok',
  'okay',
  'okey',
  'baik',
  'thanks',
  'thank you',
  'terima kasih',
  'tq',
]);

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
 * How long a channel binding stands before the claimant re-confirms.
 *
 * A binding was an indefinite credential: `verifiedAt` was set once and never
 * read again, so a Telegram account takeover gave permanent access to that
 * claimant's intake with no further challenge, and nothing could revoke it.
 *
 * Ninety days is long enough to sit out a claim from notification to
 * settlement without interrupting anyone mid-flow, and short enough that a
 * stale account does not stay useful forever. Re-confirming is one tap, which
 * is the reason a bound period can be this cheap.
 */
const BINDING_MAX_AGE_DAYS = 90;

/**
 * Callback value behind the "I agree" button on the consent notice.
 *
 * Prefixed like the pagination marker so it can never collide with a real
 * choice value — a claimant selecting a cause of loss must not be able to
 * accidentally grant consent.
 */
const CONSENT_AGREED = CONSENT_AGREED_VALUE;

/** Declining. Prefixed like the others so it cannot collide with a real value. */
const CONSENT_DECLINED = '__consent:decline';

/**
 * Ids for the two questions asked before any flow is chosen.
 *
 * Named because three places now key on them — the handlers that answer them,
 * and `synthesiseStep`, which rebuilds them for a channel that has to ask
 * again from the transcript alone.
 */
const CONSENT_STEP_ID = '__consent';
const CLAIM_TYPE_STEP_ID = '__claim-type';
/**
 * The "which detail would you like to change?" menu.
 *
 * Synthetic like the two above, and stranding for the same reason: it belongs
 * to no flow, so a pull channel that only sees persisted text had a bot message
 * asking a question and no controls to answer it. Unlike the two above it needs
 * the case to rebuild, because its choices *are* the answers.
 */
const EDIT_MENU_STEP_ID = '__edit-menu';
const EDIT_MENU_PROMPT = 'Which detail would you like to change?';

/**
 * "Would you like to start another claim?" — asked, and then actually waited on.
 *
 * It used to be rhetorical: the bot posed the question and started the new
 * claim in the same breath, so the claim-type menu arrived underneath it and
 * the claimant's answer was never wanted. Anyone messaging for another reason —
 * asking after the claim they had just filed, most obviously — was pushed into
 * filing a second one.
 */
const ANOTHER_CLAIM_STEP_ID = '__another-claim';
// ANOTHER_CLAIM_YES/NO now live in conversation-display, beside the function
// that turns them into words — defined only here, they rendered raw.

/**
 * The turn could not be written down at all.
 *
 * Separate from a turn that failed to *process*: that one has a row, an error
 * on it and a claimant who was told. This one has none of those, so the only
 * safe response is to leave the update unacknowledged and let the platform
 * send it again.
 */
export class TurnNotRecordedError extends Error {
  constructor(
    readonly platformMessageId: string,
    readonly cause: Error
  ) {
    super(`Could not record turn ${platformMessageId}: ${cause.message}`);
    this.name = 'TurnNotRecordedError';
  }
}

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

/**
 * A slash command we do not handle, rather than an answer.
 *
 * Deliberately narrow: a single token of letters after a slash. No answer in
 * any flow takes that shape — a flight number, a hospital name and a policy
 * number all fail it — and the known words (`/back`, `/edit`, `/human`) are
 * matched before this is reached.
 */
function isCommand(word: string): boolean {
  return /^\/[a-z_]+$/.test(word);
}

/** What to call an unreadable message kind, in words a claimant would use. */
function describeMediaKind(kind: string): string {
  const names: Record<string, string> = {
    voice: 'voice note',
    video_note: 'video message',
    video: 'video',
    audio: 'audio file',
    sticker: 'sticker',
    animation: 'GIF',
    location: 'location',
    venue: 'place',
    poll: 'poll',
    dice: 'dice roll',
  };
  return names[kind] ?? 'message of that kind';
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
/**
 * The documents a claimant said they would send, rendered for the confirmation.
 *
 * Empty string when there are none, so the happy path reads exactly as it did.
 */
const outstanding = (flow: CaseFlow, answers: CaseAnswers): string => {
  const deferred = flow.steps.filter(
    step =>
      step.answerType === 'document' &&
      String(answers[step.id] ?? '')
        .trim()
        .toLowerCase() === DEFER_VALUE
  );
  if (deferred.length === 0) return '';

  return (
    '\n\nStill to send, whenever you have them — just send them in this chat:\n' +
    deferred.map(step => `• ${step.label}`).join('\n')
  );
};

@Injectable()
export class ConversationGateway implements OnModuleInit {
  private readonly logger = new Logger(ConversationGateway.name);
  private readonly transfers: TransferRegister;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly flows: FlowsService,
    @Inject(CLAIMANT_RESOLVER) private readonly claimants: ClaimantResolver,
    @Inject(CHANNEL_ADAPTERS) private readonly adapters: ChannelAdapter[],
    @Inject(ANSWER_NORMALISER) private readonly normaliser: AnswerNormaliser,
    @Inject(PHONE_VERIFIER) private readonly phones: PhoneVerifier,
    private readonly consent: ConsentService,
    private readonly config: ConfigService,
    private readonly infoRequests: InfoRequestEvents
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
    const inCountry: CaseChannel[] = [
      CaseChannel.WEB_CHAT,
      CaseChannel.WEB_FORM,
      CaseChannel.STAFF,
      CaseChannel.EMAIL,
    ];
    if (inCountry.includes(channel)) return null;

    const byChannel: Partial<Record<CaseChannel, OffshoreProviderKey>> = {
      [CaseChannel.TELEGRAM]: 'TELEGRAM',
      // Added when the adapter went live, not when the registry entry was
      // written: OFFSHORE_PROVIDERS has carried a WHATSAPP entry since the
      // channel shipped, but nothing mapped a CaseChannel onto it, so every
      // WhatsApp turn transferred claimant data to Meta and recorded no
      // TransferRecord. Found by running one through, not by reading this.
      [CaseChannel.WHATSAPP]: 'WHATSAPP',
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

  /** Has this confirmation gone stale? */
  private bindingExpired(verifiedAt: Date): boolean {
    const ageMs = Date.now() - verifiedAt.getTime();
    return ageMs > BINDING_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  }

  /**
   * Subscribe to "a case was returned to the claimant" (MASTER_PLAN §8,
   * 18 Aug). Registered here rather than injected the other way because the
   * cases module must not import the chat module back — the same inversion as
   * this module's other ports, via the InfoRequestEvents provider.
   */
  onModuleInit(): void {
    this.infoRequests.on(caseId => this.handleInfoRequested(caseId));
  }

  /**
   * The eager half of the claimant-amend loop: the moment an operator returns
   * a case, tell the claimant on the channel they actually used and put the
   * conversation back on that case — the email notification alone missed
   * everyone bound by phone.
   *
   * Deliberately narrow: no binding means email was genuinely the only door;
   * a binding mid-way through a *different* intake keeps its place (no
   * hijack — the lazy path in `applyAnswer` resumes the returned case once
   * they are free); and a binding in HANDOVER gets the reattachment but not
   * the bot message, because the whole point of handover is that the machine
   * stops talking.
   */
  private async handleInfoRequested(caseId: string): Promise<void> {
    const caseRow = await this.prisma.case.findUnique({ where: { id: caseId } });
    if (!caseRow || caseRow.status !== CaseStatus.INFO_REQUESTED || !caseRow.claimantId) return;

    const binding = await this.prisma.conversationBinding.findFirst({
      where: { claimantId: caseRow.claimantId, verifiedAt: { not: null } },
      orderBy: { lastSeenAt: 'desc' },
    });
    if (!binding) return;
    if (binding.activeCaseId && binding.activeCaseId !== caseRow.id) return;

    const adapter = this.adapterFor(binding.channel);
    const speak = binding.mode === ConversationMode.BOT;
    const reached = await this.resumeReturnedCase(binding.id, caseRow, {
      adapter,
      platformUserId: binding.platformUserId,
      speak,
    });

    // The push said nothing because the platform would not carry it — on
    // WhatsApp, a claimant silent for over 24 hours is outside the service
    // window, and that is precisely the claimant an info request is for. An
    // approved template is the only door left; if none is configured, the
    // lazy resume on their next message still catches them.
    if (speak && !reached && adapter?.sendTemplate) {
      const templateName = this.config.get<string>('WHATSAPP_INFO_REQUEST_TEMPLATE') ?? '';
      const sent = await adapter.sendTemplate(binding.platformUserId, {
        name: templateName,
        languageCode: this.config.get<string>('WHATSAPP_TEMPLATE_LOCALE') ?? 'en',
        bodyParams: [caseRow.caseNumber, (caseRow.reviewNote ?? '').trim().slice(0, 300)],
      });
      if (sent) {
        // Recorded like any other outbound word: the transcript is the
        // evidence that the firm asked, and a template the claimant read is
        // no less said for having been pre-approved.
        await this.prisma.conversationMessage.create({
          data: {
            bindingId: binding.id,
            channel: binding.channel,
            direction: MessageDirection.OUTBOUND,
            text:
              `Our team needs one more thing on ${caseRow.caseNumber}` +
              (caseRow.reviewNote ? `: ${caseRow.reviewNote}` : '.') +
              ' (sent as an approved template — the conversation window had closed)',
            status: ConversationMessageStatus.PROCESSED,
            processedAt: new Date(),
          },
        });
      }
    }
  }

  /**
   * Point the conversation back at a returned case: reattach the binding, set
   * the cursor at what is actually missing (the first unmet mandatory step,
   * else the review step so the existing `edit` machinery can change any
   * answer), say the operator's ask, and ask the step. Shared by the eager
   * push above and the lazy branch in `applyAnswer`, so the two cannot drift.
   */
  private async resumeReturnedCase(
    bindingId: string,
    caseRow: { id: string; caseNumber: string; reviewNote: string | null; answers: unknown },
    options: { adapter?: ChannelAdapter; platformUserId: string; speak: boolean }
  ): Promise<boolean> {
    const flow = await this.flows.forCase(caseRow as never);
    const answers = (caseRow.answers ?? {}) as CaseAnswers;
    const step =
      missingSteps(flow, answers)[0] ??
      getStep(flow, REVIEW_STEP_ID) ??
      flow.steps.find(candidate => candidate.isReview) ??
      null;

    await this.prisma.case.update({
      where: { id: caseRow.id },
      data: { currentStepId: step?.id ?? null },
    });
    await this.prisma.conversationBinding.update({
      where: { id: bindingId },
      data: { activeCaseId: caseRow.id },
    });

    if (!options.speak || !options.adapter) return false;

    const ask = caseRow.reviewNote?.trim();
    // The note message carries the ask alone; what to *do* about it belongs
    // to the question that follows, which on the button channels is also
    // where the controls are. Saying "type edit, then confirm" here and then
    // asking a review step that says it again read as the bot repeating
    // itself — which is exactly how it was reported.
    // `say` swallows delivery failures by design (a message that will not
    // send must not fail the turn), so the send is probed directly here: the
    // caller needs to know whether the claimant was actually reached before
    // deciding to spend an approved template on them.
    try {
      await options.adapter.send(options.platformUserId, {
        text:
          `Our team needs one more thing on ${caseRow.caseNumber}` +
          (ask ? `:\n\n${ask}` : '.') +
          (step && !step.isReview ? '\n\nOnce it is in, review and confirm to resubmit.' : ''),
      });
    } catch (error) {
      this.logger.warn(
        `Binding ${bindingId}: the info-request push did not reach ${caseRow.caseNumber} — ` +
          `${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }

    // Delivered, so it belongs in the transcript.
    await this.prisma.conversationMessage.create({
      data: {
        bindingId,
        channel: options.adapter.channel,
        direction: MessageDirection.OUTBOUND,
        text:
          `Our team needs one more thing on ${caseRow.caseNumber}` +
          (ask ? `:\n\n${ask}` : '.') +
          (step && !step.isReview ? '\n\nOnce it is in, review and confirm to resubmit.' : ''),
        status: ConversationMessageStatus.PROCESSED,
        processedAt: new Date(),
      },
    });
    if (step) {
      if (step.isReview) {
        // Not the submission ceremony. The pinned review prompt says
        // "(16 of 16) Thank you… confirm to submit", which after a return
        // reads as if nothing happened. Reworded for the correction, and no
        // progress counter — that counts forward steps, and this is not one.
        await this.ask(
          options.adapter,
          bindingId,
          options.platformUserId,
          {
            ...step,
            prompt:
              'Here is what you told us. Type "edit" to change an answer, ' +
              'then confirm to resubmit.',
          },
          0,
          { steps: flow.steps, answers }
        );
      } else {
        await this.ask(
          options.adapter,
          bindingId,
          options.platformUserId,
          step,
          0,
          { steps: flow.steps, answers },
          undefined,
          flow
        );
      }
    }
    return true;
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
          //
          // Media is tested before the contact marker, and the order is the
          // whole point: WhatsApp puts `wa_id` on every inbound message, so
          // `sharedPhone` is always set there and an uncaptioned upload used
          // to be described as a shared contact. Telegram, which only sets it
          // on a real `request_contact` tap, never showed the fault — so the
          // channel where it mattered was the one where it was invisible.
          text:
            payload.text ??
            describeCallbackValue(payload.callbackValue) ??
            (payload.mediaRef ? SHARED_MEDIA_DESCRIPTION : null) ??
            (payload.sharedPhone ? SHARED_PHONE_DESCRIPTION : null),
          callbackValue: payload.callbackValue ?? null,
          mediaRef: payload.mediaRef ?? null,
        },
      });
      messageId = message.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        this.logger.debug(`Turn ${payload.platformMessageId} already seen; skipping.`);
        return;
      }
      // We could not even record that this happened — the database is down or
      // refusing. Distinguished from every other failure because the recovery
      // differs: there is no row to mark, nothing to show an operator, and the
      // claimant's message is simply gone once the poller moves past it.
      //
      // Raised as its own type so the ingress can decline to acknowledge the
      // update. Telegram then redelivers it, and the insert-first dedupe makes
      // that safe. A transient outage costs a delay instead of an answer.
      throw new TurnNotRecordedError(payload.platformMessageId, error as Error);
    }

    // A group is not a claimant. Refused before the binding upsert, so no
    // group ever acquires one: the platform id in a group identifies the
    // *group*, meaning a single binding would put one person's intake — case
    // number, answers, deadline warnings — in front of everyone in it.
    //
    // Answered rather than ignored, because somebody added the bot on purpose.
    // The reply carries nothing about any claim.
    if (payload.chatType && payload.chatType !== 'private') {
      this.logger.warn(`Refusing a ${payload.chatType} chat: claims are one-to-one.`);
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.UNPARSEABLE,
          error: `Refused: ${payload.chatType} chat`,
          processedAt: new Date(),
        },
      });
      await this.safeSend(adapter, payload.platformUserId, {
        text:
          'We can only handle a claim in a private chat, so that your details stay between ' +
          'us. Please message me directly.',
      });
      return;
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
      // The claimant is told something went wrong rather than left waiting —
      // unless an agent has the conversation, in which case the bot staying
      // quiet matters more than the apology. This path fired unconditionally
      // and was the one place the machine could still speak over a human.
      const inHandover = await this.prisma.conversationBinding
        .findUnique({
          where: {
            channel_platformUserId: {
              channel: payload.channel,
              platformUserId: payload.platformUserId,
            },
          },
          select: { mode: true },
        })
        .catch(() => null);

      if (inHandover?.mode !== ConversationMode.HANDOVER) {
        await this.safeSend(adapter, payload.platformUserId, {
          text: 'Sorry — something went wrong on our side. Please try again in a moment.',
        });
      }
    }
  }

  /**
   * Mark inbound turns that were recorded and then abandoned.
   *
   * Called by the ingress, which is the singleton. Returns how many, so the
   * caller can say so loudly — the whole point is that this loss was
   * previously invisible: the row sits `PENDING`, redelivery is suppressed by
   * the dedupe index, and nobody goes looking for a claim that was never
   * created.
   */
  async markStalledTurns(channel: CaseChannel, olderThan: Date): Promise<number> {
    const { count } = await this.prisma.conversationMessage.updateMany({
      where: {
        channel,
        direction: MessageDirection.INBOUND,
        status: ConversationMessageStatus.PENDING,
        createdAt: { lt: olderThan },
      },
      data: {
        status: ConversationMessageStatus.FAILED,
        error: 'Recorded but never processed — the service stopped mid-turn',
        processedAt: new Date(),
      },
    });
    return count;
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
        data: {
          status: ConversationMessageStatus.FAILED,
          error: 'Rate limited',
          processedAt: new Date(),
        },
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

    // Editing an earlier message does not change what we already recorded, so
    // the claimant is pointed at the correction tools that do.
    if (payload.editedMessage) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.UNPARSEABLE,
          error: 'Edited message — cannot be applied retrospectively',
          processedAt: new Date(),
        },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          'We saw that you edited an earlier message, but we had already recorded the first ' +
          'version. Type "back" to change your last answer, or "edit" to change any of them.',
      });
      return;
    }

    // Something we cannot read, answered before anything tries to interpret
    // it. Silence here is what made a voice note look like a broken bot.
    if (payload.unsupportedMedia) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.UNPARSEABLE,
          error: `Unsupported message kind: ${payload.unsupportedMedia}`,
          processedAt: new Date(),
        },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          `Sorry — we cannot read a ${describeMediaKind(payload.unsupportedMedia)} here. ` +
          'Please send a photo, a file, or type your answer. Type "human" if you would ' +
          'rather speak to someone.',
      });
      return;
    }

    // 3. A human has this conversation. Checked BEFORE onboarding, not after:
    //    an unverified binding in handover was still receiving bot messages,
    //    because the verification branch returned first. Rare, but the whole
    //    point of handover is that the machine stops talking.
    //
    //    Record what the claimant said and say nothing automated — a bot
    //    answering over an agent mid-exchange reads to the claimant as one
    //    confused party rather than two, and can overwrite a correction the
    //    agent just made.
    if (binding.mode === ConversationMode.HANDOVER) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: { status: ConversationMessageStatus.AWAITING_AGENT, processedAt: new Date() },
      });
      this.logger.debug(`Binding ${binding.id} is in handover; bot standing down.`);
      return;
    }

    // 4. Nothing about a claim is served to an unverified sender — including
    //    one whose confirmation has simply gone stale.
    if (binding.verifiedAt && this.bindingExpired(binding.verifiedAt)) {
      this.logger.log(
        `Binding ${binding.id} verified over ${BINDING_MAX_AGE_DAYS} days ago; re-confirming.`
      );
      await this.prisma.conversationBinding.update({
        where: { id: binding.id },
        // The claimant link is kept: re-confirming the same number resolves to
        // the same person, and clearing it would orphan the active Case.
        data: { verifiedAt: null },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'It has been a while since we last confirmed it was you.',
      });
      await this.runOnboarding(messageId, payload, adapter, binding);
      return;
    }

    if (!binding.verifiedAt) {
      await this.runOnboarding(messageId, payload, adapter, binding);
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
  /**
   * Ask for a phone number, then prove it, inside the conversation.
   *
   * The whole point of this channel: no login page in front of the chat. A
   * claimant opens a link and starts talking, exactly as they would on
   * WhatsApp — the difference being that WhatsApp's platform vouches for the
   * number and a browser cannot, so the code does that job instead.
   *
   * Two states, both readable off the binding, so a reload resumes correctly:
   *   pendingPhone null  → we are asking for the number
   *   pendingPhone set   → we are waiting for the code
   *
   * `otpAttempts` caps the guessing. Six digits is 1-in-a-million per guess,
   * which is ample against a person and nothing at all against a script, so
   * the binding burns its pending number after MAX_CODE_ATTEMPTS and the
   * claimant starts that step again rather than being allowed to grind.
   */
  private async runPhoneVerification(
    messageId: string,
    payload: InboundTurnPayload,
    adapter: ChannelAdapter,
    binding: { id: string; pendingPhone?: string | null; otpAttempts?: number }
  ): Promise<void> {
    const typed = (payload.text ?? '').trim();

    if (!binding.pendingPhone) {
      const phone = normalisePhone(typed);
      if (!phone) {
        await this.say(adapter, binding.id, payload.platformUserId, {
          text:
            'Hello — we handle insurance claims, and we can start yours here.\n\n' +
            'What is your mobile number? Please include the country code, for example ' +
            '+60 12 345 6789.',
        });
        return;
      }

      // Stored before the send: if the send fails we still know which number
      // is outstanding, and the claimant can ask for the code again rather
      // than the conversation forgetting what it was doing.
      await this.prisma.conversationBinding.update({
        where: { id: binding.id },
        data: { pendingPhone: phone, otpAttempts: 0 },
      });

      try {
        await this.phones.send(phone);
      } catch (error) {
        this.logger.error(
          `Binding ${binding.id}: could not send a code: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
        await this.prisma.conversationBinding.update({
          where: { id: binding.id },
          data: { pendingPhone: null },
        });
        await this.say(adapter, binding.id, payload.platformUserId, {
          text:
            'Sorry — we could not send the code just now. Please check the number and ' +
            'send it again.',
        });
        return;
      }

      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          `We have sent a six-digit code to ${phone} on WhatsApp. Please type it here.\n\n` +
          'Send a different number instead if that one was wrong.',
      });
      return;
    }

    // Waiting for the code. A number typed again means they corrected it, so
    // start that step over rather than reading a phone number as a code.
    const corrected = normalisePhone(typed);
    if (corrected && corrected !== binding.pendingPhone) {
      await this.prisma.conversationBinding.update({
        where: { id: binding.id },
        data: { pendingPhone: null, otpAttempts: 0 },
      });
      await this.runPhoneVerification(messageId, payload, adapter, {
        id: binding.id,
        pendingPhone: null,
        otpAttempts: 0,
      });
      return;
    }

    const code = typed.replace(/\D/g, '');
    const verified = code.length >= 4 && (await this.phones.verify(binding.pendingPhone, code));

    if (!verified) {
      const attempts = (binding.otpAttempts ?? 0) + 1;
      if (attempts >= MAX_CODE_ATTEMPTS) {
        await this.prisma.conversationBinding.update({
          where: { id: binding.id },
          data: { pendingPhone: null, otpAttempts: 0 },
        });
        await this.say(adapter, binding.id, payload.platformUserId, {
          text:
            'That is too many incorrect codes. Please send your mobile number again and ' +
            'we will send a fresh one.',
        });
        return;
      }

      await this.prisma.conversationBinding.update({
        where: { id: binding.id },
        data: { otpAttempts: attempts },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'That code did not match. Please check it and type it again.',
      });
      return;
    }

    const resolved = await this.claimants.resolveByVerifiedPhone(
      binding.pendingPhone,
      payload.channel
    );

    await this.prisma.conversationBinding.update({
      where: { id: binding.id },
      data: {
        claimantId: resolved.claimantId,
        tenantId: resolved.tenantId ?? this.handlingFirmTenantId(),
        verifiedAt: new Date(),
        pendingPhone: null,
        otpAttempts: 0,
      },
    });

    this.logger.log(`Binding ${binding.id} bound on ${payload.channel} via a verified code.`);

    await this.say(adapter, binding.id, payload.platformUserId, { text: 'Thank you.' });

    // Straight on into consent and the claim-type menu, the same continuation
    // the platform-verified path takes. Returning here would leave the
    // claimant thanked and asked nothing until they spoke again.
    const bound = await this.prisma.conversationBinding.findUniqueOrThrow({
      where: { id: binding.id },
    });
    await this.requireConsentThenStart(messageId, payload, adapter, bound);
  }

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

    // Channels that cannot attest a number verify it in the conversation.
    //
    // WhatsApp and Telegram never take this path: the platform already proved
    // the number, so `sharedPhone` arrives with the turn. A browser proves
    // nothing — it can claim any number — so web chat asks for it and then for
    // a code. Same destination, reached by typing instead of by Meta vouching.
    if (!payload.sharedPhone && !adapter.capabilities?.platformVerifiedPhone) {
      await this.runPhoneVerification(messageId, payload, adapter, binding);
      return;
    }

    if (!payload.sharedPhone) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          'Hello — we handle insurance claims, and we can start yours here.\n\n' +
          'First, please tap the button below to share your mobile number so we know who ' +
          'you are.',
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
        // A first-time claimant has no tenant to derive: the resolver reads it
        // from an existing claim, and there is none yet. Left null the binding
        // is invisible in the operator queue, which filters by tenant — so a
        // claimant who types "human" at the consent gate, before choosing a
        // claim type, asks for help that reaches nobody. That is precisely
        // when a confused person asks.
        //
        // The handling firm is the honest answer for a conversation with no
        // claim behind it: it is the firm taking the intake. Overwritten with
        // the real tenant the moment a Case is created.
        tenantId: resolved.tenantId ?? this.handlingFirmTenantId(),
        verifiedAt: new Date(),
        pendingPhone: null,
      },
    });

    // What to say depends on whether the claimant actually did anything.
    //
    // On Telegram they tapped "Share my number", so "Thank you." acknowledges
    // that act and `removeKeyboard` dismisses the keyboard it came from. On
    // WhatsApp `wa_id` rides every inbound message, so this binding happened
    // on the claimant's first word: thanking them there thanks them for
    // nothing they did, and — reported from a real handset — reads as a
    // non-sequitur ("Hi" → "Thank you."). Worse, that channel then had no
    // greeting at all, because the greeting lives in the share request it
    // never sends. So it gets the greeting instead.
    const shared = adapter.capabilities?.requestsContactShare ?? true;
    await this.say(adapter, binding.id, payload.platformUserId, {
      text: shared
        ? 'Thank you.'
        : 'Hello — we handle insurance claims, and we can start yours here.',
      // The share-contact keyboard has done its job; without this it stays
      // pinned beneath every question that follows.
      removeKeyboard: true,
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
      // The answer to "would you like to start another claim?". Handled before
      // anything else, because the binding has no active case at this point and
      // every other path here assumes the claimant wants to open one.
      if (payload.callbackValue === ANOTHER_CLAIM_NO) {
        await this.prisma.conversationMessage.update({
          where: { id: messageId },
          data: {
            status: ConversationMessageStatus.PROCESSED,
            stepId: ANOTHER_CLAIM_STEP_ID,
            processedAt: new Date(),
          },
        });
        await this.say(adapter, binding.id, payload.platformUserId, {
          text:
            'No problem. Your claim is with our team and we will be in touch.\n\n' +
            'Message us any time to start another, or type "human" to reach a person.',
        });
        return;
      }

      if (payload.callbackValue === ANOTHER_CLAIM_YES) {
        await this.prisma.conversationMessage.update({
          where: { id: messageId },
          data: {
            status: ConversationMessageStatus.PROCESSED,
            stepId: ANOTHER_CLAIM_STEP_ID,
            processedAt: new Date(),
          },
        });
        await this.requireConsentThenStart(messageId, payload, adapter, binding);
        return;
      }

      // The lazy half of the claimant-amend loop: before offering a fresh
      // claim, look for one of theirs an operator has returned. Without this,
      // a claimant whose case sat in INFO_REQUESTED was offered a *new* claim
      // while the one waiting on them stayed unreachable — the dead end the
      // 18 Aug audit found behind §1's "claimant amends" edge.
      if (binding.claimantId) {
        const returned = await this.prisma.case.findMany({
          where: {
            claimantId: binding.claimantId,
            status: CaseStatus.INFO_REQUESTED,
            ...(binding.tenantId ? { tenantId: binding.tenantId } : {}),
          },
          orderBy: { updatedAt: 'desc' },
        });

        // A tap on the chooser below names its case directly.
        const chosen = payload.callbackValue?.startsWith(RESUME_CASE_CALLBACK_PREFIX)
          ? returned.find(
              row => row.id === payload.callbackValue!.slice(RESUME_CASE_CALLBACK_PREFIX.length)
            )
          : undefined;

        if (chosen || returned.length === 1) {
          await this.prisma.conversationMessage.update({
            where: { id: messageId },
            data: {
              status: ConversationMessageStatus.PROCESSED,
              processedAt: new Date(),
            },
          });
          await this.resumeReturnedCase(binding.id, chosen ?? returned[0], {
            adapter,
            platformUserId: payload.platformUserId,
            speak: true,
          });
          return;
        }

        // More than one waiting: ask which, rather than guessing. Picking the
        // most recent would have the claimant answer a question about a claim
        // they were not thinking of, and the answer would be filed against
        // the wrong one — worse than an extra tap.
        if (returned.length > 1) {
          await this.prisma.conversationMessage.update({
            where: { id: messageId },
            data: {
              status: ConversationMessageStatus.PROCESSED,
              processedAt: new Date(),
            },
          });
          await this.say(adapter, binding.id, payload.platformUserId, {
            text: 'You have more than one claim request waiting on you. Which shall we continue?',
            step: {
              id: '__resume-menu',
              prompt: 'Which claim request would you like to continue?',
              label: 'Claim request',
              answerType: 'choice',
              choices: returned.map(row => ({
                value: `${RESUME_CASE_CALLBACK_PREFIX}${row.id}`,
                label: `${row.caseNumber} — ${(row.reviewNote ?? 'more information needed').slice(0, 40)}`,
                title: row.caseNumber,
                description: (row.reviewNote ?? 'More information needed').slice(0, 72),
              })),
              next: { type: 'end' },
            } as FlowStep,
          });
          return;
        }
      }

      await this.requireConsentThenStart(messageId, payload, adapter, binding);
      return;
    }

    const caseRow = await this.prisma.case.findUnique({ where: { id: binding.activeCaseId } });

    // Checked before a single field of it is used. `patchAnswer` asserts
    // access too, but by then the case number, the answer bag and the review
    // summary have already been read from this row and may have been sent.
    // The guarantee rested entirely on `activeCaseId` never being wrong; one
    // future write path setting it from user input would have turned that into
    // a cross-claimant disclosure. Same function the browser passes through,
    // not a second copy of the rule.
    if (caseRow) {
      this.cases.assertAccess(caseRow, this.claimantContext(binding));
    }

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
    // Did the last thing we tried to say actually reach them?
    //
    // `patchAnswer` advances the cursor before the next question is sent, so a
    // send that throws — a rate limit, a blocked bot, a network blip — leaves
    // the claimant looking at the *previous* question while the Case has moved
    // on. Their next message was then stored as the answer to something they
    // had never been shown. Re-asking costs one message; the alternative is
    // wrong data with nothing to indicate it.
    const lastOutbound = await this.prisma.conversationMessage.findFirst({
      where: { bindingId: binding.id, direction: MessageDirection.OUTBOUND },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, stepId: true },
    });

    // Consent is a condition of *processing*, not a box ticked once at the
    // start. It was checked when the Case was opened and never again, so a
    // claimant who withdrew in the PWA carried on being asked questions here
    // and having the answers stored — contrary to the withdrawal the consent
    // service had faithfully recorded.
    if (
      binding.claimantId &&
      !(await this.consent.hasConsent(binding.claimantId, ConsentPurpose.CLAIM_PROCESSING))
    ) {
      this.logger.warn(`Binding ${binding.id}: consent withdrawn; collection stops here.`);
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.UNPARSEABLE,
          error: 'Consent withdrawn',
          processedAt: new Date(),
        },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          'You have withdrawn your consent for us to process this claim, so we have stopped ' +
          'here. Your claim request is unaffected — please contact our support desk if you ' +
          'would like to continue.',
      });
      return;
    }

    const flow = await this.flows.forCase(caseRow, {
      channel: payload.channel,
      locale: noticeLocale(binding.locale),
    });
    const step = caseRow.currentStepId ? getStep(flow, caseRow.currentStepId) : null;

    if (step && lastOutbound?.status === ConversationMessageStatus.FAILED) {
      this.logger.warn(
        `Binding ${binding.id}: last question failed to send; re-asking "${step.id}" ` +
          'rather than reading this message as its answer.'
      );
      // Marked handled so the next turn is not caught by the same check —
      // otherwise a claimant could never get past a single failed send.
      await this.prisma.conversationMessage.update({
        where: { id: lastOutbound.id },
        data: { status: ConversationMessageStatus.PROCESSED, error: 'Re-sent after failure' },
      });
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.UNPARSEABLE,
          stepId: step.id,
          error: 'Previous question never delivered',
          processedAt: new Date(),
        },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'Sorry — our last message may not have reached you. Here it is again.',
      });
      await this.ask(
        adapter,
        binding.id,
        payload.platformUserId,
        step,
        0,
        undefined,
        undefined,
        flow
      );
      return;
    }

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
        text:
          `Your claim request ${caseRow.caseNumber} is with our team. ` +
          'Would you like to start another claim?',
        step: this.anotherClaimMenu(),
      });
      return;
    }

    // "More options" on a long choice list — navigation, not an answer.
    if (payload.callbackValue?.startsWith(PAGE_CALLBACK_PREFIX)) {
      const page = Number(payload.callbackValue.slice(PAGE_CALLBACK_PREFIX.length)) || 0;
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.PROCESSED,
          stepId: step.id,
          processedAt: new Date(),
        },
      });
      await this.ask(adapter, binding.id, payload.platformUserId, step, page);
      return;
    }

    // A document step wants a file, and the answer it stores is the resulting
    // CaseDocument id — the same upload-then-answer sequence as the PWA, so
    // the evidence checklist and the flow agree about what has been supplied.
    // A tapped button beats typed text: it carries the stored value directly
    // and needs no interpretation.
    // `let`, because a confirm step typed rather than tapped is rewritten to
    // the value the button would have carried — see CONFIRM_WORDS below.
    let raw = payload.callbackValue ?? payload.text;
    const answers = caseRow.answers as CaseAnswers;

    // Corrections come before anything else interprets the message.
    //
    // The flow assumed a claimant who never mistypes. In practice most of a
    // real intake is error recovery, and until now a wrong answer was
    // permanent — the cursor only ever moved forwards.
    const word = typeof raw === 'string' ? raw.trim().toLowerCase() : '';

    // A command, not an answer. `/start` is the universal Telegram gesture for
    // "restart this bot" and the first thing every user is taught; mid-flow it
    // was being stored verbatim as the answer to whatever step was open.
    if (isCommand(word)) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.PROCESSED,
          stepId: step.id,
          processedAt: new Date(),
        },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          word === '/start'
            ? 'You already have a claim in progress — here is where we were.'
            : 'Sorry, we do not recognise that command. Here is the question again.',
      });
      await this.ask(
        adapter,
        binding.id,
        payload.platformUserId,
        step,
        0,
        undefined,
        undefined,
        flow
      );
      return;
    }

    if (BACK_WORDS.has(word)) {
      await this.reopenStep(
        messageId,
        payload,
        adapter,
        binding,
        caseRow,
        flow,
        answers,
        step.id,
        true
      );
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
      await this.ask(
        adapter,
        binding.id,
        payload.platformUserId,
        step,
        0,
        undefined,
        undefined,
        flow
      );
      return;
    }

    // Asking what to do. Answered immediately, with the question repeated and
    // a person offered — rather than handing over and going quiet, which is
    // what "help" used to do.
    if (HELP_WORDS.has(word)) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.PROCESSED,
          stepId: step.id,
          processedAt: new Date(),
        },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          `We are on "${step.label}". You can type "back" to change your last answer, ` +
          '"edit" to change any of them, or "human" to speak to one of our team. ' +
          'Here is the question again.',
      });
      await this.ask(
        adapter,
        binding.id,
        payload.platformUserId,
        step,
        0,
        undefined,
        undefined,
        flow
      );
      return;
    }

    // Asking for a person, at any point. Nothing about intake should trap
    // someone who wants to speak to somebody.
    //
    // Except on the web form, which has no thread for a person to answer in.
    // Handing over there would stand the bot down and leave the claimant on a
    // form that has stopped responding — and the trigger is a bare word, so
    // "agent" typed into a free-text field would do it by accident. The word
    // falls through to ordinary validation instead, and the way to reach a
    // person on that surface is the phone number in the footer.
    if (HUMAN_WORDS.has(word) && payload.channel !== CaseChannel.WEB_FORM) {
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

    // The edit menu is synthetic, while the persisted Case cursor deliberately
    // stays on review. Cancelling therefore means acknowledging the menu tap
    // and asking that unchanged review step again. Without an explicit escape,
    // an accidental "Change something" tap traps the claimant in a list where
    // every possible action mutates an answer.
    if (raw === EDIT_CANCEL_VALUE) {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.PROCESSED,
          stepId: EDIT_MENU_STEP_ID,
          processedAt: new Date(),
        },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'No changes made. Please review your details again.',
      });
      await this.ask(
        adapter,
        binding.id,
        payload.platformUserId,
        step,
        0,
        undefined,
        undefined,
        flow
      );
      return;
    }

    if (typeof raw === 'string' && raw.startsWith(EDIT_CALLBACK_PREFIX)) {
      const target = raw.slice(EDIT_CALLBACK_PREFIX.length);
      await this.reopenStep(
        messageId,
        payload,
        adapter,
        binding,
        caseRow,
        flow,
        answers,
        target,
        false
      );
      return;
    }

    // A confirm step typed rather than tapped.
    //
    // The buttons carry the value 'true'; the validator accepts nothing else.
    // So a claimant who replied "yes" to "confirm to submit your claim request"
    // — which is what the sentence asks for, in the only way a keyboard allows
    // — failed validation at the last step of a completed claim. Taps are still
    // the happy path; this is for the person who typed instead, or whose client
    // did not render the buttons at all.
    if (step.answerType === 'confirm' && typeof raw === 'string' && !payload.callbackValue) {
      if (CONFIRM_WORDS.has(word)) raw = 'true';
      else if (DECLINE_WORDS.has(word)) raw = 'false';
    }

    // "Change something" at the review opens the edit menu — the same thing
    // typed "edit" does. This used to hand the conversation to a human: the
    // branch predates the edit flow, and its comment ("there is no
    // edit-a-single-answer flow") stayed true long after the flow existed.
    // The cost was found live on 18 Aug: the review *instructs* typing
    // "edit", the claimant reasonably taps the visible button instead, and
    // lands in a queue with the bot stood down — a hang, from following the
    // interface. "human" still reaches a person; a decline reaches the tool
    // that answers it.
    if (step.answerType === 'confirm' && raw === 'false') {
      await this.prisma.conversationMessage.update({
        where: { id: messageId },
        data: {
          status: ConversationMessageStatus.PROCESSED,
          stepId: step.id,
          processedAt: new Date(),
        },
      });
      await this.offerEditMenu(messageId, payload, adapter, binding, flow, answers);
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
      await this.ask(
        adapter,
        binding.id,
        payload.platformUserId,
        step,
        0,
        undefined,
        undefined,
        flow
      );
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
      if (payload.storedDocumentId) {
        // Web chat: the bytes went through the upload endpoint before this
        // turn was sent, so there is nothing to fetch. Ownership is checked
        // rather than trusted — the id arrives from the claimant's browser,
        // and an unchecked one would let any guessable document, including
        // another claimant's, be offered as evidence on this claim.
        const stored = await this.prisma.caseDocument.findFirst({
          where: { id: payload.storedDocumentId, caseId: caseRow.id },
        });
        if (!stored) {
          this.logger.error(
            `Turn offered document ${payload.storedDocumentId} for case ${caseRow.id}, ` +
              'which does not belong to it. Rejected.'
          );
          await this.prisma.conversationMessage.update({
            where: { id: messageId },
            data: {
              status: ConversationMessageStatus.UNPARSEABLE,
              stepId: step.id,
              error: 'Document does not belong to this case',
              processedAt: new Date(),
            },
          });
          await this.say(adapter, binding.id, payload.platformUserId, {
            text: 'We could not attach that file. Please try uploading it again.',
          });
          return;
        }
        value = stored.id;

        // Tie the turn to the file, as the fetch-from-platform branch below
        // already does. Without it the transcript held a message with no text
        // and no document, so the claimant's own upload rendered as an empty
        // bubble — a successful attachment that looked like a failed send —
        // and an operator opening the thread saw nothing at all.
        await this.prisma.conversationMessage.update({
          where: { id: messageId },
          data: { caseDocumentId: stored.id },
        });
      } else if (!payload.mediaRef && step.optional && word === SKIP_VALUE) {
        value = SKIP_VALUE;
      } else if (!payload.mediaRef && word === DEFER_VALUE) {
        // Accepted on a *mandatory* document, unlike "skip". Nothing is
        // waived: the answer records that the evidence is still owed, the
        // checklist an adjuster reads counts uploads and so still shows it
        // missing, and the claimant is told both of those things below.
        //
        // The alternative was re-asking until they gave up, which is what the
        // conversation did — and it stalled the flow before the payout details,
        // so the claim was lost rather than merely incomplete.
        value = DEFER_VALUE;
        await this.say(adapter, binding.id, payload.platformUserId, {
          text:
            `Noted — we will carry on without it for now, and your claim will show ` +
            `"${step.label}" as still to come. You can send it in this chat whenever you have it.`,
        });
      } else if (!payload.mediaRef) {
        await this.prisma.conversationMessage.update({
          where: { id: messageId },
          data: {
            status: ConversationMessageStatus.UNPARSEABLE,
            stepId: step.id,
            processedAt: new Date(),
          },
        });
        await this.say(adapter, binding.id, payload.platformUserId, {
          text: await this.withEscapeHatch(binding, step, [
            'Please send the document as a photo or a file.',
          ]),
        });
        await this.ask(
          adapter,
          binding.id,
          payload.platformUserId,
          step,
          0,
          undefined,
          undefined,
          flow
        );
        return;
      } else {
        // Fetched only now — a claimant sending unrelated pictures earlier cost
        // nothing, because media is carried as a reference until a step wants it.
        let media: { buffer: Buffer; filename: string; mimeType: string };
        try {
          media = await adapter.fetchMedia(payload.mediaRef);
        } catch (error) {
          // A file the platform will not serve is the claimant's problem to
          // solve and ours to explain. "Something went wrong on our side" was
          // both untrue and un-actionable: they would send the same file again.
          if ((error as Error).name === 'MediaTooLargeError') {
            await this.prisma.conversationMessage.update({
              where: { id: messageId },
              data: {
                status: ConversationMessageStatus.UNPARSEABLE,
                stepId: step.id,
                error: (error as Error).message,
                processedAt: new Date(),
              },
            });
            await this.say(adapter, binding.id, payload.platformUserId, {
              text:
                'That file is too large for us to receive (the limit is 20 MB). Please send a ' +
                'smaller version — a photo of the document usually works.',
            });
            return;
          }
          throw error;
        }
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
          data: {
            status: ConversationMessageStatus.UNPARSEABLE,
            stepId: step.id,
            processedAt: new Date(),
          },
        });
        await this.ask(
          adapter,
          binding.id,
          payload.platformUserId,
          step,
          0,
          undefined,
          undefined,
          flow
        );
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
          let iso = parseTextDate(String(raw), step.answerType);

          // The normaliser's own fallback, reached explicitly.
          //
          // It is invoked further down for every other answer type, but a date
          // step returned before ever getting there — so the one place a human
          // is most likely to write something no grammar covers ("last
          // Tuesday", "the day we landed") was the one place the fallback could
          // not run. Enabling the model changed nothing for dates.
          //
          // Still a fallback, never the norm: the deterministic parser above
          // handles every ordinary form, so this costs an offshore call only
          // for a genuine outlier — which is what keeps the §2.5 per-claim
          // ceiling intact. What comes back is re-validated exactly like a
          // typed answer; the model never decides what happens next.
          if (!iso && this.normaliser.isEnabled()) {
            const interpreted = await this.normaliser.normalise(String(raw), step, {
              claimId: caseRow.id,
              claimantId: binding.claimantId,
              tenantId: caseRow.tenantId,
            });
            if (typeof interpreted === 'string') {
              // Accept either an ISO value the validator already likes, or a
              // human form the deterministic parser can now read — the model
              // is not trusted to have produced a canonical shape.
              iso = validateAnswer(step, interpreted).valid
                ? interpreted
                : parseTextDate(interpreted, step.answerType);
              if (iso) this.logger.log(`Step ${step.id}: model read "${raw}" as a date.`);
            }
          }

          if (!iso) {
            await this.prisma.conversationMessage.update({
              where: { id: messageId },
              data: {
                status: ConversationMessageStatus.UNPARSEABLE,
                stepId: step.id,
                processedAt: new Date(),
              },
            });
            await this.recoverFromUnreadableAnswer(
              adapter,
              binding,
              payload.platformUserId,
              step,
              String(raw),
              flow
            );
            return;
          }
          value = iso;
        } else {
          value = raw;
        }
      } else {
        // parseAmount, not Number(): `Number('   ')` is 0, so a blank-looking
        // message recorded a zero claim amount with no error, and
        // `Number('RM1,200')` is NaN, so the most natural way to write a sum
        // was refused. Both are how people actually type on a phone.
        value = step.answerType === 'number' ? parseAmount(String(raw)) : raw;
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
        data: {
          status: ConversationMessageStatus.UNPARSEABLE,
          stepId: step.id,
          processedAt: new Date(),
        },
      });
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: await this.withEscapeHatch(binding, step, [
          result.error ?? 'Sorry, that does not look right.',
        ]),
      });
      await this.ask(
        adapter,
        binding.id,
        payload.platformUserId,
        step,
        0,
        undefined,
        undefined,
        flow
      );
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
      // Only move the cursor somewhere that exists. This wrote the resume id
      // and cleared the marker *before* checking, so a stale one left the Case
      // pointing at no step at all — and the turn then fell through to the
      // end-of-flow branch. Clearing the marker alone lets the normal
      // next-step logic take over, which is the correct recovery.
      await this.prisma.case.update({
        where: { id: caseRow.id },
        data: resumeStep
          ? { currentStepId: caseRow.resumeStepId, resumeStepId: null }
          : { resumeStepId: null },
      });
      if (!resumeStep) {
        this.logger.error(
          `Case ${caseRow.id} wanted to resume at "${caseRow.resumeStepId}", which is not in ` +
            'its pinned flow. Carrying on from the next step instead.'
        );
      }
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

    if (!result.nextStep && !step.isReview) {
      // The flow ran out somewhere other than the review. `resolveNextStep`
      // also returns null for a rule resolving to nothing, a target that does
      // not exist, and its own cycle guard — and treating those as "the
      // claimant confirmed" called submit() on an incomplete Case, which threw,
      // stranded the cursor at null, and then told the claimant on their next
      // message that their claim "is with our team" when no operator would
      // ever see it. Three wrong things, the last one a lie.
      //
      // A person is the right answer here: the flow is misconfigured and no
      // amount of re-asking will fix it from the claimant's side.
      // `isReview`, not `answerType === 'confirm'`: a confirm step is not
      // necessarily a review. The medical flow carries a mid-flow specialist
      // notice that is also a confirm, and reading one as the other would
      // submit an incomplete case the moment such a step fell last.
      this.logger.error(
        `Flow ${flow.travelClaimType} ran out of steps at "${step.id}", which is not a review. ` +
          'Handing to an agent rather than submitting an incomplete case.'
      );
      await this.handOverToAgent(
        messageId,
        payload,
        adapter,
        binding,
        step.id,
        `Flow ran out of steps at "${step.label}" without reaching a review`
      );
      return;
    }

    if (!result.nextStep) {
      // The conversation has run out of steps at the review — so submit,
      // here, now.
      //
      // Previously this said "submit your claim in the app", which was wrong
      // twice: a Telegram claimant has no app and was never told of one, and
      // nothing submitted the Case at all. It stayed IN_PROGRESS and never
      // reached the operator vetting queue — a completed intake that no human
      // would ever see.
      // A required step with no answer means submit() would throw, and the
      // claimant would be told at the very last moment that something is
      // missing by a bot that never asks for it. Reachable whenever a
      // published flow gains a required step while claims are in flight —
      // adding the claimant's name did exactly that to twelve of them.
      // Asking is the only useful response.
      const answers = (result.case?.answers ?? caseRow.answers ?? {}) as CaseAnswers;
      const [firstMissing] = missingSteps(flow, answers);
      if (firstMissing) {
        this.logger.warn(
          `Case ${caseRow.caseNumber} reached the review without "${firstMissing.id}". ` +
            'Asking for it rather than failing the submission.'
        );
        await this.say(adapter, binding.id, payload.platformUserId, {
          text: 'One more thing before we submit — we are missing an answer.',
        });
        await this.ask(
          adapter,
          binding.id,
          payload.platformUserId,
          firstMissing,
          0,
          { steps: flow.steps, answers },
          this.progressOf(flow, firstMissing.id)
        );
        return;
      }

      const submitted = await this.cases.submit(caseRow.id, this.claimantContext(binding));
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          `Thank you — your claim request ${submitted.caseNumber} has been submitted. ` +
          'Our team will review it and contact you if anything further is needed.' +
          // Named, not just counted. A claimant who deferred a document has
          // been told the claim would carry on without it; ending with a
          // cheerful confirmation and no mention of it would read as though
          // the gap had closed itself, and they would not send the file.
          outstanding(flow, (submitted.answers ?? {}) as CaseAnswers),
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
  private claimantContext(binding: {
    claimantId: string | null;
    tenantId: string | null;
  }): TenantContext {
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
    binding: {
      id: string;
      claimantId: string | null;
      tenantId: string | null;
      locale?: string | null;
    }
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
        // Where consent was actually given, which the record has to say. Every
        // channel used to be filed as MESSAGING — true of Telegram and
        // WhatsApp, and plainly untrue of somebody ticking a box on a web form.
        // Read off the binding rather than a value the client sent, so a
        // mislabelled consent cannot be produced by editing a request.
        capturedVia:
          payload.channel === CaseChannel.WEB_FORM
            ? ConsentChannel.WEB_FORM
            : ConsentChannel.MESSAGING,
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
    // Declining is offered explicitly. Consent with no rendered way to refuse
    // is weak evidence that it was freely given, and a claimant who does not
    // want to agree was otherwise left with no move at all.
    if (payload.callbackValue === CONSENT_DECLINED) {
      this.logger.log(`Consent declined on ${payload.channel} for claimant ${binding.claimantId}.`);
      await this.say(adapter, binding.id, payload.platformUserId, {
        text:
          'That is your choice — we cannot open a claim without permission to handle your ' +
          'details, so we will stop here.\n\nMessage us any time if you change your mind, or ' +
          'contact our support desk to claim another way.',
      });
      return;
    }

    const typedAtConsent = Boolean(payload.text?.trim());
    await this.say(adapter, binding.id, payload.platformUserId, {
      // Framed, not dumped. The approved wording is a legal notice and reads
      // like one; arriving with no lead-in, it is the point a claimant decides
      // whether this is a real insurer or a phishing attempt. The framing is
      // ours; the notice itself is the approved text, unaltered — consent has
      // to be provably against a version, so not a word of it is rewritten.
      text: typedAtConsent
        ? `Please use one of the buttons below.\n\n${notice.title}\n\n${notice.body}`
        : 'Before we take any details, here is how we handle them. ' +
          `Please read this and let us know you are happy to continue.\n\n` +
          `${notice.title}\n\n${notice.body}`,
      step: this.consentStep(notice.title),
    });
  }

  /**
   * The "another claim?" question, shaped as a step so adapters render it
   * normally — buttons on Telegram, a list row on WhatsApp, a choice control
   * in the PWA.
   */
  private anotherClaimMenu(): FlowStep {
    return {
      id: ANOTHER_CLAIM_STEP_ID,
      prompt: 'Would you like to start another claim?',
      label: 'Another claim',
      answerType: 'choice',
      choices: [
        { value: ANOTHER_CLAIM_YES, label: 'Yes, start another' },
        { value: ANOTHER_CLAIM_NO, label: 'No, thank you' },
      ],
      next: { type: 'end' },
    };
  }

  /** The consent question, shaped as a step so adapters render it normally. */
  private consentStep(title: string): FlowStep {
    return {
      id: CONSENT_STEP_ID,
      prompt: title,
      label: 'Consent',
      answerType: 'choice',
      choices: [
        { value: CONSENT_AGREED, label: 'I agree' },
        { value: CONSENT_DECLINED, label: 'I do not agree' },
      ],
      next: { type: 'end' },
    };
  }

  /**
   * Rebuild a step that belongs to no flow.
   *
   * Two questions are asked before a Case exists — consent, and which kind of
   * claim this is — and neither is in any flow definition, because no flow has
   * been chosen yet. A push channel never needs them again: the adapter was
   * handed the step and drew its keyboard on the spot. A pull channel has only
   * what was persisted, and the transcript stores text, not choices.
   *
   * Without this the PWA reaches the consent notice and renders no way to
   * agree to it — a claimant stopped at the gate by the one question that has
   * no alternative route. Returning the ids rather than duplicating the steps
   * keeps a single definition of each.
   */
  async synthesiseStep(
    stepId: string,
    locale: string | null,
    /**
     * The case the menu is about, for `__edit-menu` only.
     *
     * Optional because the pre-claim steps have no case to be about — asking
     * for one would make every caller pass null. Absent it, the edit menu
     * cannot be rebuilt and null is the honest answer.
     */
    context?: { flow: CaseFlow; answers: CaseAnswers }
  ): Promise<FlowStep | null> {
    if (stepId === CLAIM_TYPE_STEP_ID) return this.claimTypeMenu();
    if (stepId === ANOTHER_CLAIM_STEP_ID) return this.anotherClaimMenu();
    if (stepId === EDIT_MENU_STEP_ID) {
      return context ? this.editMenuStep(context.flow, context.answers) : null;
    }
    if (stepId === CONSENT_STEP_ID) {
      const notice = await this.consent.currentNotice(
        ConsentPurpose.CLAIM_PROCESSING,
        noticeLocale(locale)
      );
      return notice ? this.consentStep(notice.title) : null;
    }
    return null;
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
    binding: {
      id: string;
      claimantId: string | null;
      tenantId: string | null;
      locale?: string | null;
    }
  ): Promise<void> {
    const chosen =
      payload.callbackValue && payload.callbackValue in TRAVEL_CLAIM_TYPE_LABELS
        ? (payload.callbackValue as TravelClaimType)
        : null;

    if (!chosen) {
      // updateMany with a PENDING guard, not update: this runs both as its own
      // turn and as the tail of onboarding, and the onboarding message it
      // would otherwise relabel is genuinely ONBOARDING, not a flow answer.
      await this.prisma.conversationMessage.updateMany({
        where: { id: messageId, status: ConversationMessageStatus.PENDING },
        data: { status: ConversationMessageStatus.PROCESSED, processedAt: new Date() },
      });
      // Typing "flight delay" instead of tapping used to resend the identical
      // menu with no explanation, indefinitely — the claimant repeats
      // themselves louder and the bot repeats itself back. Say what is wrong.
      const typedSomething = Boolean(payload.text?.trim());
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: typedSomething
          ? 'Please tap one of the buttons below so I record the right kind of claim.'
          : 'What has happened? Choose the option that fits best.',
        step: this.claimTypeMenu(),
      });
      return;
    }

    const created = await this.cases.create(
      {
        travelClaimType: chosen,
        // Whichever channel this turn arrived on. Hardcoding TELEGRAM was
        // harmless while it was the only adapter and wrong the moment a
        // second one registered — WhatsApp cases would have been labelled
        // Telegram, in the column an operator filters by.
        channel: payload.channel,
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

    // The most useful message in the conversation, and the one that was
    // missing. "A few questions and we are done" preceded sixteen of them,
    // and the very next line said "(1 of 16)" — the bot contradicting itself
    // while trust is still being established.
    //
    // Saying what to gather is what stops someone meeting "upload the
    // Property Irregularity Report" at question eleven with nothing to hand.
    // Saying they can stop is what stops a long form being abandoned rather
    // than paused.
    const flow = await this.flows.forCase(
      { flowDefinitionId: created.flowDefinitionId ?? null, travelClaimType: chosen },
      { channel: payload.channel, locale: noticeLocale(binding.locale) }
    );
    const questions = flow.steps.filter(step => !step.isReview).length;
    const needs = whatYouWillNeed(flow);

    await this.say(adapter, binding.id, payload.platformUserId, {
      text:
        `Your claim request is open — reference ${created.caseNumber}.\n\n` +
        `There are ${questions} questions. You will need:\n` +
        needs.map((need: string) => `• ${need}`).join('\n') +
        '\n\nYou can stop at any point and carry on later — we will pick up where you left off.' +
        // Said plainly rather than discovered. Serving the consent notice in
        // Malay and then asking every question in English promises a level of
        // support that does not exist yet — worse than being consistently
        // English, because the claimant has been shown otherwise. This line
        // goes when the flow overlays are authored.
        (noticeLocale(binding.locale) === 'ms'
          ? '\n\nSoalan-soalan berikut adalah dalam Bahasa Inggeris buat masa ini. Taip ' +
            '"human" jika anda mahu bercakap dengan pegawai kami.'
          : ''),
    });

    // create() returns the resolved current step, so no second lookup.
    if (created.currentStep) {
      await this.ask(
        adapter,
        binding.id,
        payload.platformUserId,
        created.currentStep,
        0,
        undefined,
        undefined,
        flow
      );
    }
  }

  /**
   * The firm that owns a conversation with no claim behind it yet.
   *
   * Returns null rather than throwing when unconfigured — unlike Case
   * creation, which refuses. Refusing here would stop a claimant talking to
   * the bot at all over a queue-visibility concern. Logged as an error
   * instead, because the consequence is silent: conversations no operator sees.
   */
  private handlingFirmTenantId(): string | null {
    const configured = this.config.get<string>('HANDLING_FIRM_TENANT_ID');
    if (!configured) {
      this.logger.error(
        'HANDLING_FIRM_TENANT_ID is not set, so this conversation has no tenant until a Case ' +
          'is created — it will not appear in any operator queue until then.'
      );
      return null;
    }
    return configured;
  }

  /**
   * The claim-type chooser, shaped as a flow step so adapters render it normally.
   *
   * Public because a pull channel needs it too: the PWA asks what question is
   * open and renders the answer control from the step, and this one belongs to
   * no flow — there is no Case yet to pin one.
   */
  claimTypeMenu(): FlowStep {
    return {
      id: CLAIM_TYPE_STEP_ID,
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
    answers: CaseAnswers,
    targetStepId: string,
    isBack: boolean
  ): Promise<void> {
    const target = getStep(flow, targetStepId);
    if (!target) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'Sorry, we could not find that answer to change.',
      });
      return;
    }

    // Stepping back from the first question has nowhere to go.
    if (isBack && targetStepId === flow.entryStepId) {
      await this.say(adapter, binding.id, payload.platformUserId, {
        text: 'This is the first question, so there is nothing before it to change.',
      });
      await this.ask(
        adapter,
        binding.id,
        payload.platformUserId,
        target,
        0,
        undefined,
        undefined,
        flow
      );
      return;
    }

    const previousId = isBack
      ? this.previousAnsweredStep(flow, caseRow.currentStepId, answers)
      : targetStepId;
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
    await this.ask(
      adapter,
      binding.id,
      payload.platformUserId,
      stepToRedo,
      0,
      undefined,
      undefined,
      flow
    );
  }

  /**
   * The last step before `fromStepId` that the claimant actually answered.
   *
   * It now checks, which the name always promised and the code never did: it
   * returned the previous step in *declaration* order regardless. A branch
   * skips steps, so on trip-cancellation's non-illness path "back" reopened
   * `doc-medical-report` — a mandatory upload the branch had deliberately
   * excluded, which the claimant had never been asked for and could not
   * satisfy. Walking back over unanswered steps is the whole fix.
   */
  private previousAnsweredStep(
    flow: CaseFlow,
    fromStepId: string | null,
    answers: CaseAnswers
  ): string | null {
    const order = flow.steps.map(step => step.id);
    const index = fromStepId ? order.indexOf(fromStepId) : order.length;
    if (index <= 0) return null;

    for (let i = index - 1; i >= 0; i--) {
      if (answers[order[i]] !== undefined) return order[i];
    }
    return null;
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
    const step = this.editMenuStep(flow, answers);
    const choices = step?.choices ?? [];

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
      text: EDIT_MENU_PROMPT,
      step: step!,
    });
  }

  /**
   * The edit menu as a step, or null when there is nothing to change yet.
   *
   * One definition, used twice: `offerEditMenu` sends it on a push channel, and
   * `synthesiseStep` rebuilds it for a pull channel that has only the persisted
   * transcript. Two copies would drift, and the way that failure shows up is a
   * claimant on the PWA tapping a button that names a step the server no longer
   * offers.
   */
  private editMenuStep(flow: CaseFlow, answers: CaseAnswers): FlowStep | null {
    const choices = flow.steps
      .filter(step => step.answerType !== 'confirm' && answers[step.id] !== undefined)
      .map(step => {
        const value = answers[step.id];
        const shown =
          step.answerType === 'document'
            ? 'provided'
            : step.answerType === 'choice'
              ? (step.choices?.find(choice => choice.value === value)?.label ?? String(value))
              : step.answerType === 'date' || step.answerType === 'datetime'
                ? // The claimant is hunting the wrong value; an ISO timestamp
                  // is not how they said it and not how they will spot it.
                  (formatDateAnswer(String(value), step.answerType) ?? String(value))
                : String(value);
        return {
          value: `${EDIT_CALLBACK_PREFIX}${step.id}`,
          label: `${step.label} — ${shown}`.slice(0, 60),
          // Split for channels with two-slot rows: WhatsApp shows 24
          // characters of title and 72 of description, so the value lives in
          // the slot that fits it.
          title: step.label,
          description: shown,
        };
      });

    if (choices.length === 0) return null;

    // Escape first, not after every answered field. On a phone the list can be
    // taller than the viewport; putting cancellation at the bottom recreates
    // the trap for anyone who cannot yet discover that the menu scrolls.
    choices.unshift({
      value: EDIT_CANCEL_VALUE,
      label: 'Cancel — back to review',
      title: 'Cancel',
      description: 'Return to review without changing anything',
    });

    return {
      id: EDIT_MENU_STEP_ID,
      prompt: EDIT_MENU_PROMPT,
      label: 'Change a detail',
      answerType: 'choice',
      choices,
      next: { type: 'end' },
    };
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
      // Shared with the review summary rather than formatted again here. The
      // two disagreeing is how a claimant confirms "11 August 2026" mid-flow
      // and then reads back "2026-08-11T00:00:00.000Z" at the review.
      const shown = formatDateAnswer(String(stored), step.answerType);
      return shown === null ? null : `Recorded as ${shown}. Type "back" if that is not right.`;
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
  /**
   * The message a claimant gets when their answer was refused — plus a way out
   * once refusing it again has stopped being useful.
   *
   * The escalation existed before this, and was reachable from exactly one
   * place: the date parser. Every other rejection — a flight number that will
   * not match, a description under the length floor, a document that never
   * arrives — repeated the same line indefinitely, so the claimant most in need
   * of a person was never told there was one. The wording was never the
   * problem; the single call site was.
   *
   * Three, because someone who has missed three times will not succeed by being
   * told the rule a fourth time. Offered, never forced: `skip` only where the
   * step allows it, `later` only on a document, and a person only on request,
   * since an unstaffed queue out of hours is its own kind of silence.
   */
  private async withEscapeHatch(
    binding: { id: string },
    step: FlowStep,
    lines: string[]
  ): Promise<string> {
    // Counted from the transcript rather than a counter column: the rows are
    // already written, and a schema field would be one more thing to reset
    // correctly when a claimant goes "back" to an earlier step.
    const attempts = await this.prisma.conversationMessage.count({
      where: {
        bindingId: binding.id,
        stepId: step.id,
        direction: MessageDirection.INBOUND,
        status: ConversationMessageStatus.UNPARSEABLE,
      },
    });
    if (attempts < 3) return lines.join('\n\n');

    const escapes: string[] = [];
    if (step.optional) escapes.push(`type "${SKIP_VALUE}" to leave this one blank`);
    if (step.answerType === 'document') {
      escapes.push(`type "${DEFER_VALUE}" and send it when you have it`);
    }
    escapes.push('type "human" and a person will take over');
    return [...lines, `If this is not working, ${escapes.join(', or ')}.`].join('\n\n');
  }

  /**
   * An answer we could not read must not end the conversation.
   *
   * The old behaviour sent one error bubble and returned. The claimant was
   * left with an apology, no question in front of them, and — if they had
   * scrolled at all — nothing on screen saying what to do next. From their
   * side an intake that stops responding is indistinguishable from one that
   * has crashed, and the claim is abandoned rather than retried.
   *
   * So every unreadable answer ends the same way: guidance, then the question
   * again. Re-asking is cheap and it is what a person would do.
   *
   * The guidance escalates with repeated failure rather than repeating itself,
   * because a claimant who has now missed three times is not going to succeed
   * by being told the format a fourth time — they need a way out. The escape
   * is offered, never forced: `skip` only where the step allows it, and a
   * person only on request, since an unstaffed queue out of hours is its own
   * kind of silence.
   */
  private async recoverFromUnreadableAnswer(
    adapter: ChannelAdapter,
    binding: { id: string },
    platformUserId: string,
    step: FlowStep,
    raw: string,
    flow?: CaseFlow
  ): Promise<void> {
    const greeted = GREETING_WORDS.has(raw.trim().toLowerCase());
    const lines: string[] = [];

    if (greeted) {
      // Not an error. They said hello; the honest reply is hello back and the
      // question they were on, not an apology for something they did not do.
      lines.push('Hello! We are partway through your claim — here is where we left off.');
    } else if (step.answerType === 'date') {
      lines.push('Sorry, we could not read that as a date.');
      lines.push(
        'You can write it as 16/06/2026, or as 16 June 2026 — or just "today" or "yesterday".'
      );
    } else {
      lines.push('Sorry, we could not read that as a date and time.');
      lines.push('You can write it as 16/06/2026 14:30, or as 16 June 2026 2:30pm.');
    }

    // A greeting is not a failed answer, so it never earns the escape line —
    // otherwise saying hello three times would offer someone a way out of a
    // question they have not tried to answer.
    const text = greeted ? lines.join('\n\n') : await this.withEscapeHatch(binding, step, lines);

    await this.say(adapter, binding.id, platformUserId, { text });
    await this.ask(adapter, binding.id, platformUserId, step, 0, undefined, undefined, flow);
  }

  private async ask(
    adapter: ChannelAdapter,
    bindingId: string | null,
    platformUserId: string,
    step: FlowStep,
    page = 0,
    review?: { steps: FlowStep[]; answers: CaseAnswers },
    progress?: { position: number; total: number },
    /**
     * The flow being walked, so the position can be derived when the caller
     * did not compute one. The counter used to appear only on the forward
     * path — every re-ask after a rejected answer, every correction and the
     * first question of a case dropped it, so "(3 of 12)" blinked in and out
     * and read as a glitch rather than a progress indicator.
     */
    flow?: CaseFlow
  ): Promise<void> {
    // Position first, so a claimant knows how much is left before reading the
    // question. Eighteen questions with no end in sight is how intake gets
    // abandoned halfway.
    const shown = progress ?? (flow ? this.progressOf(flow, step.id) : undefined);
    let text = shown ? `(${shown.position} of ${shown.total}) ${step.prompt}` : step.prompt;

    // Where to find the thing, and what an acceptable version of it looks
    // like. Sits between the question and the format rules because that is the
    // order someone answers in: understand what is wanted, find it, then worry
    // about how to type it.
    if (step.hint) text += `\n\n${step.hint}`;

    // A channel with no date control gets an explicit format hint, because the
    // claimant is about to type free text that has to parse.
    //
    // It advertises what `parseTextDate` actually accepts, not the narrowest
    // legal form. The parser has always taken "16 June 2026", "16 Jun 26" and
    // the relative words — but only the recovery message said so, so the
    // generous wording was reserved for claimants who had already failed once.
    // Telling them up front is the same sentence moved one turn earlier, and
    // it removes the turn.
    const capabilities = adapter.capabilities ?? CHANNEL_CAPABILITIES[adapter.channel];
    if (
      capabilities?.dateEntry === 'text' &&
      (step.answerType === 'date' || step.answerType === 'datetime')
    ) {
      text +=
        step.answerType === 'date'
          ? '\n\nFor example 16/06/2026, or 16 June 2026 — or just "today" or "yesterday".'
          : // No relative words offered here: `parseTextDate` refuses them on a
            // datetime step, because inventing a clock reading the claimant
            // never gave would put a made-up time on an incident record.
            '\n\nFor example 16/06/2026 14:30, or 16 June 2026 2:30pm.';
    }

    if (step.answerType === 'document' && capabilities?.document === 'link_out') {
      text += '\n\nPlease upload this document in the app.';
    }

    // Said on the step itself, not saved for the third failure. A claimant who
    // does not have the airline's confirmation yet should learn on sight that
    // the claim can go on without it — waiting until they have failed three
    // times means the ones who quietly gave up after one never heard it.
    if (step.answerType === 'document') {
      text += step.optional
        ? `\n\nIf this one does not apply to you, type "${SKIP_VALUE}".`
        : `\n\nDo not have it yet? Type "${DEFER_VALUE}" and we will carry on — you can send it ` +
          'in this chat later.';
    }

    // A confirm step on a channel with nowhere to put a summary must carry the
    // answers in the message. Otherwise the claimant is asked to agree to
    // details they cannot see — and what they are agreeing to is a claim
    // submission.
    // Only under the actual review. Keyed on `answerType === 'confirm'` this
    // pasted the entire answer dump beneath the medical flow's specialist
    // notice, which asks the claimant to acknowledge something quite different.
    if (step.isReview && review && capabilities?.summaryPanel === false) {
      const summary = summariseAnswers(review.steps, review.answers);
      if (summary) text += `\n\n${summary}`;
    }

    // A correction feature nobody knows about does not exist. Kept to one
    // short line rather than repeated instructions, and only on steps a
    // claimant types into — a tapped button is not where typos happen.
    //
    // Periodic rather than every turn. On a sixteen-question flow the same
    // sentence appeared under fourteen consecutive questions, and a line that
    // never changes stops being read after the second sighting — so the one
    // claimant who needed it at question eleven had long since tuned it out.
    // First question and every fifth after: still always on screen within a
    // few turns of wanting it, without becoming wallpaper. Re-asks carry no
    // position, and those show it, which is right — a claimant who just got
    // something wrong is exactly who the line is for.
    const remindable = step.answerType !== 'confirm' && step.answerType !== 'choice';
    if (remindable && (!shown || shown.position === 1 || shown.position % 5 === 0)) {
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
