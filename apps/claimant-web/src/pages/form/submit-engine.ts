import type { CaseAnswers, FlowStep } from '@tci/shared-types';

import type { FormTurn } from '@/hooks/use-form-conversation';

/**
 * Sending a whole section, one answer at a time.
 *
 * The form shows six fields at once; the server accepts one answer per request,
 * in the order it expects, and rejects an answer aimed at a different step. So
 * this walks the changed fields in path order and stops at the first refusal —
 * which is the only part of the form with no precedent anywhere in the
 * codebase, and therefore the part worth the most care.
 *
 * Three things it has to get right, and each has a failure that looks like
 * something else:
 *
 *  - **Move the cursor before answering.** If the server is not on this step,
 *    an `__edit:<stepId>` goes first. Without it the answer is refused and the
 *    refusal reads as a validation error on a field that was perfectly fine.
 *  - **Stop at the first refusal.** Sending the rest would answer later
 *    questions against the wrong steps, and the claimant would see one error
 *    while four more answers went astray behind it.
 *  - **Never blame a field for the rate limit.** The server drops anything past
 *    20 messages a minute per conversation; a section sent in a burst can cross
 *    it. That is not the field's fault and must not be shown as if it were.
 */

/**
 * How the server says "you are going too fast".
 *
 * Matched on the distinctive middle of the sentence rather than the whole
 * thing, so punctuation or a trailing edit does not break it. The source is
 * `conversation.gateway.ts`, in the `recentTurns > MAX_TURNS_PER_MINUTE`
 * branch — grep that phrase there before changing this.
 *
 * Coupling the client to server copy is not lovely, and the alternative is
 * worse: the rate limiter marks the turn FAILED and drops it, so there is no
 * status, code or header to read — only what the bot said. Getting this wrong
 * has a specific cost, which is why it is not matched loosely: too broad and an
 * ordinary validation message is mistaken for a rate limit and silently
 * retried; too narrow and the claimant is told a perfectly good answer was
 * rejected.
 *
 * Only the *first* refusal in a burst gets a reply, but that reply stays the
 * most recent thing the bot said, so a retry that is also dropped still reads
 * as rate-limited here.
 */
export const RATE_LIMIT_HINT = /faster than we can read/i;

/** Stands in for the edge throttle's 429, which carries no message of its own. */
const THROTTLED = 'You are sending messages faster than we can read them.';

export interface SubmitContext {
  /** Where the server's cursor is now. Read from the last `/state`. */
  currentStepId: string | null;
  /** What the claimant has entered in this section, keyed by step id. */
  values: Record<string, string>;
  /** What the server already has, so unchanged fields are not re-sent. */
  answers: CaseAnswers;
  /** The steps of this section, in flow order. */
  steps: FlowStep[];
  /**
   * Documents already attached to the case, by step.
   *
   * The durable half of an upload. Storing the bytes and answering the question
   * are two operations, and only the first survives a reload — so a file the
   * claimant can plainly see on screen is one the engine would otherwise not
   * know about, and a required document with no answer is a section that
   * cannot advance and says nothing about why.
   *
   * No id here: the public payload does not carry one, deliberately. The step
   * is enough, because the server can look up what is attached to it.
   */
  documents?: Array<{ stepId: string | null }>;
}

export interface TurnOutcome {
  /** The server's cursor after the turn. */
  currentStepId: string | null;
  /** The bot's *last* reply. What the rate limiter is recognised by. */
  lastReply: string | null;
  /**
   * The bot's *first* reply, which is the reason when an answer is refused.
   *
   * A refusal is two messages: why, and then the question again. On a chat that
   * reads correctly — the correction, then the re-ask. A form has the question
   * on screen already, so showing the last message put the prompt itself under
   * the field as though it were an error: "(4 of 16) And when does your trip
   * end?" beneath the trip-end box the claimant had just filled in, complete
   * with the chat's question numbering and its instructions for typing "skip".
   *
   * The reason is the first of the two, and it is the one worth reading.
   */
  reason?: string | null;
}

export interface SubmitResult {
  /** True when every changed field was accepted. */
  ok: boolean;
  /** The step that was refused, and the message to show beneath it. */
  error?: { stepId: string; message: string };
  /** Steps whose answers the server took. */
  accepted: string[];
}

/** The literal the server reads as "I am not answering this one". */
export const SKIP = 'skip';

/**
 * The literal for "use the file I already sent for this step".
 *
 * Mirrors `ATTACHED_VALUE` on the server, which is where the reasoning lives.
 */
export const ATTACHED = '__attached';

/** A step the claimant has changed, or answered for the first time. */
export function changedSteps(context: SubmitContext): FlowStep[] {
  return context.steps.filter(step => {
    const entered = context.values[step.id];
    if (entered === undefined) return false;

    const existing = context.answers[step.id];
    // A document is named by the id of the file just stored, so "unchanged"
    // never applies: uploading again means the first one was wrong.
    if (step.answerType === 'document') return entered !== '';

    return String(entered) !== String(existing ?? '');
  });
}

/**
 * What to send for each step in the section, in flow order.
 *
 * The subtlety is optional steps, and it cost a whole afternoon to see: the
 * server does not treat *unanswered* as *skipped*. An optional question with no
 * answer is still an open question, so the cursor returns to it — and a form
 * that only sends what the claimant touched leaves it open for ever. The claim
 * silently never reaches Review, and the symptom is a Submit button that
 * appears to do nothing.
 *
 * The chat has no such problem because it asks the question and the claimant
 * types "skip". A form has no such moment: leaving a box empty *is* the skip,
 * and this is where that gets said out loud.
 *
 * Only for steps the claimant has genuinely left alone — a field with an
 * existing answer is not re-skipped, and a required one is never skipped at
 * all, because the server would refuse it and the refusal belongs on the field.
 */
export function stepsToSend(context: SubmitContext): Array<{ step: FlowStep; value: string }> {
  const changed = new Set(changedSteps(context).map(step => step.id));

  return context.steps
    .map(step => {
      if (changed.has(step.id)) return { step, value: context.values[step.id] };

      const untouched = (context.values[step.id] ?? '') === '';
      const unanswered =
        context.answers[step.id] === undefined || context.answers[step.id] === '';

      /*
        A file that arrived but was never named in an answer.
        
        This is what a claimant sees as "Continue does nothing": the row says
        Uploaded because the document is on the case, the step is still open
        because no turn ever carried its id, and the engine — reading only what
        was typed this session — finds nothing to send. Silent, and permanent
        until the file is uploaded again.
        
        Reading the case closes it: the attachment is the answer, whether it was
        made a minute ago or before the last reload.
      */
      if (step.answerType === 'document' && untouched && unanswered) {
        const attached = context.documents?.some(document => document.stepId === step.id);
        if (attached) return { step, value: ATTACHED };
      }

      if (step.optional && untouched && unanswered) return { step, value: SKIP };

      return null;
    })
    .filter((entry): entry is { step: FlowStep; value: string } => entry !== null);
}

/**
 * Required questions in this section with no answer anywhere.
 *
 * A form lets somebody press Continue having filled in nothing, and the engine
 * had nothing to send for that — an empty required field is not a *changed*
 * field, and only optional ones are skipped. So no turn went out, no refusal
 * came back, and Continue did nothing at all, in silence. Which is the same
 * failure as the document that would not attach: the form was right to refuse
 * and wrong to say nothing about it.
 *
 * Answered on the server counts, so returning to a completed section and
 * pressing Continue passes straight through. A document counts as answered
 * once it is attached, whether or not its answer has been recorded yet.
 */
export function missingRequired(context: SubmitContext): FlowStep[] {
  return context.steps.filter(step => {
    if (step.optional) return false;

    const entered = (context.values[step.id] ?? '').trim();
    if (entered !== '') return false;

    const existing = context.answers[step.id];
    if (existing !== undefined && String(existing).trim() !== '') return false;

    if (step.answerType === 'document') {
      return !context.documents?.some(document => document.stepId === step.id);
    }
    return true;
  });
}

/**
 * The turns needed to record one answer.
 *
 * Two when the server's cursor is elsewhere — move, then answer. The edit turn
 * is a `callbackValue`, not text, so it can never be mistaken for something the
 * claimant typed.
 */
export function turnsFor(
  step: FlowStep,
  value: string,
  currentStepId: string | null,
  newId: () => string
): FormTurn[] {
  const turns: FormTurn[] = [];

  if (currentStepId !== step.id) {
    turns.push({ clientMessageId: newId(), callbackValue: `__edit:${step.id}` });
  }

  // Both literals are sent as text, whatever the step would otherwise take:
  // the server reads the word, not a value of that step's type.
  if (value === SKIP || value === ATTACHED) {
    turns.push({ clientMessageId: newId(), text: value, callbackStepId: step.id });
    return turns;
  }

  if (step.answerType === 'document') {
    // The bytes went to the upload endpoint first; the turn only names the
    // stored id. `value` is that id.
    turns.push({ clientMessageId: newId(), storedDocumentId: value, callbackStepId: step.id });
  } else if (step.answerType === 'choice' || step.answerType === 'confirm') {
    turns.push({ clientMessageId: newId(), callbackValue: value, callbackStepId: step.id });
  } else {
    turns.push({ clientMessageId: newId(), text: value, callbackStepId: step.id });
  }

  return turns;
}

/** Whether a non-advancing reply is the rate limiter rather than the field. */
export function isRateLimited(reply: string | null): boolean {
  return reply !== null && RATE_LIMIT_HINT.test(reply);
}

export interface SubmitDeps {
  /** Send one turn and report where the cursor ended up. */
  send: (turn: FormTurn) => Promise<TurnOutcome>;
  newId: () => string;
  /** Wait — between turns, and before retrying one that was refused. */
  wait: (ms: number) => Promise<void>;
  /** How many times to retry one turn against the rate limit. */
  retries?: number;
  /**
   * Whether a thrown error is the edge throttle rather than a real failure.
   *
   * A dependency because the engine has no business knowing about HTTP: the
   * caller owns the transport and can recognise its own 429.
   */
  isRateLimitError?: (error: unknown) => boolean;
}

const RETRY_DELAY_MS = 3_000;

/**
 * Between turns, to stay under the edge throttle.
 *
 * There are **two** rate limits and they are nothing alike. The conversation
 * one — 20 messages a minute — replies in-band and drops the message. The edge
 * one is 3 requests a second and answers 429, which the transport *throws*.
 *
 * The second is the one that actually bites, and it took running the form to
 * see it: a six-field section is nine turns, because most fields need a cursor
 * move first, and nine requests leave the browser inside a second. The first
 * three land and the fourth throws — so the claimant's section is half saved,
 * with an error that names no field.
 *
 * 350ms keeps a burst under three a second with room for jitter, and costs a
 * six-field section about two seconds — under the button's own "Saving…".
 * Retrying after the fact would work too, and would spend a claimant's time
 * recovering from something entirely predictable.
 */
const PACE_MS = 350;

/**
 * Send every changed field in the section, in path order, stopping at the
 * first refusal.
 *
 * `clientMessageId` is stable across a retry on purpose: the server dedupes on
 * it, so retrying the same turn cannot record the answer twice.
 */
export async function submitSection(
  context: SubmitContext,
  deps: SubmitDeps
): Promise<SubmitResult> {
  const retries = deps.retries ?? 2;
  const accepted: string[] = [];
  let cursor = context.currentStepId;
  let sentAny = false;

  /** One send, with the edge throttle's 429 turned into an ordinary refusal. */
  const sendOnce = async (turn: FormTurn): Promise<TurnOutcome> => {
    try {
      return await deps.send(turn);
    } catch (error) {
      if (deps.isRateLimitError?.(error)) {
        return { currentStepId: cursor, lastReply: THROTTLED };
      }
      throw error;
    }
  };

  for (const { step, value } of stepsToSend(context)) {
    const turns = turnsFor(step, value, cursor, deps.newId);
    let lastReply: string | null = null;
    let reason: string | null = null;

    for (const turn of turns) {
      if (sentAny) await deps.wait(PACE_MS);
      sentAny = true;

      // Both rate limits are handled here, and they arrive differently: the
      // edge one throws, the conversation one replies. Retrying the identical
      // turn is safe either way — the id is the same, so a message that did in
      // fact land is not recorded twice.
      let outcome = await sendOnce(turn);

      for (let attempt = 0; attempt < retries && isRateLimited(outcome.lastReply); attempt++) {
        await deps.wait(RETRY_DELAY_MS);
        outcome = await sendOnce(turn);
      }

      cursor = outcome.currentStepId;
      lastReply = outcome.lastReply;
      reason = outcome.reason ?? outcome.lastReply;

      if (isRateLimited(outcome.lastReply)) {
        // Out of retries. Reported against the section, not the field: the
        // field was fine and saying otherwise sends the claimant editing a
        // correct answer.
        return {
          ok: false,
          accepted,
          error: {
            stepId: step.id,
            message: 'We are saving your answers a little too quickly. Please try again in a moment.',
          },
        };
      }
    }

    // The cursor moving off this step is what "accepted" means. A cursor that
    // stayed put means the server refused, and its last message is why.
    if (cursor === step.id) {
      return {
        ok: false,
        accepted,
        // The bot's own words. It knows why — "that date is before your trip
        // started" — and rewording it here would produce a second, vaguer
        // description of a rule the server already stated well.
        error: {
          stepId: step.id,
          message: reason ?? lastReply ?? 'That answer was not accepted. Please check it.',
        },
      };
    }

    accepted.push(step.id);
  }

  return { ok: true, accepted };
}
