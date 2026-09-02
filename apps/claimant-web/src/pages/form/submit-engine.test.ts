import { describe, expect, it, vi } from 'vitest';
import type { FlowStep } from '@tci/shared-types';

import {
  ATTACHED,
  changedSteps,
  missingRequired,
  isRateLimited,
  stepsToSend,
  submitSection,
  turnsFor,
  type SubmitContext,
  type TurnOutcome,
} from './submit-engine';

/**
 * The submit engine is the one part of the form with no precedent in the
 * codebase, so it gets the most care.
 *
 * The form shows six fields; the server takes one answer per request, in its
 * own order, and refuses an answer aimed at a different step. Every failure
 * here disguises itself as something else — a rate limit reads as a validation
 * error, a missing cursor move reads as a bad date, an over-eager loop files
 * four answers against the wrong questions while showing one error. So these
 * tests are mostly about *which* thing the claimant is told.
 */

const step = (id: string, over: Partial<FlowStep> = {}): FlowStep =>
  ({ id, label: id, prompt: `${id}?`, answerType: 'text', ...over }) as FlowStep;

const NAME = step('claimant-name');
const START = step('trip-start', { answerType: 'date' });
const END = step('trip-end', { answerType: 'date' });

/** Ids that read in order, so an assertion says what went wrong. */
const ids = () => {
  let n = 0;
  return () => `turn-${++n}`;
};

describe('which fields get sent', () => {
  const context = (over: Partial<SubmitContext> = {}): SubmitContext => ({
    currentStepId: 'claimant-name',
    values: {},
    answers: {},
    steps: [NAME, START, END],
    ...over,
  });

  it('sends a field the claimant filled in', () => {
    const changed = changedSteps(context({ values: { 'claimant-name': 'Nur Aisyah' } }));

    expect(changed.map(s => s.id)).toEqual(['claimant-name']);
  });

  // A section is re-submitted whenever Continue is pressed, including after a
  // correction elsewhere. Re-sending an untouched field would spend turns
  // against the rate limit for nothing.
  it('leaves an unchanged field alone', () => {
    const changed = changedSteps(
      context({
        values: { 'claimant-name': 'Nur Aisyah' },
        answers: { 'claimant-name': 'Nur Aisyah' },
      })
    );

    expect(changed).toEqual([]);
  });

  it('sends a field the claimant edited', () => {
    const changed = changedSteps(
      context({
        values: { 'claimant-name': 'Nur Aisyah binti Rahman' },
        answers: { 'claimant-name': 'Nur Aisyah' },
      })
    );

    expect(changed.map(s => s.id)).toEqual(['claimant-name']);
  });

  it('sends them in flow order, not the order they were typed', () => {
    const changed = changedSteps(
      context({ values: { 'trip-end': '2026-08-19', 'claimant-name': 'Nur' } })
    );

    expect(changed.map(s => s.id)).toEqual(['claimant-name', 'trip-end']);
  });

  it('ignores a field the section did not render', () => {
    const changed = changedSteps(context({ values: { 'not-in-section': 'x' } }));

    expect(changed).toEqual([]);
  });

  // Uploading again means the first file was wrong, so a document is never
  // "unchanged" — the value is the id of the file just stored.
  it('always sends a freshly uploaded document', () => {
    const doc = step('doc-boarding-pass', { answerType: 'document' });
    const changed = changedSteps(
      context({
        steps: [doc],
        values: { 'doc-boarding-pass': 'stored-id-2' },
        answers: { 'doc-boarding-pass': 'stored-id-1' },
      })
    );

    expect(changed.map(s => s.id)).toEqual(['doc-boarding-pass']);
  });
});

describe('optional fields left blank', () => {
  const OPTIONAL = step('policy-number', { optional: true });
  const context = (over: Partial<SubmitContext> = {}): SubmitContext => ({
    currentStepId: 'claimant-name',
    values: {},
    answers: {},
    steps: [NAME, OPTIONAL],
    ...over,
  });

  /**
   * The bug this exists to prevent, and it was invisible until the form was
   * driven end to end: the server does not read *unanswered* as *skipped*. An
   * optional question with no answer is still open, so the cursor returns to it
   * — and a form that only sends what the claimant touched leaves it open for
   * ever. The claim never reaches Review and Submit appears to do nothing.
   */
  it('sends "skip", so the flow can move past them', () => {
    const sending = stepsToSend(context({ values: { 'claimant-name': 'Nur' } }));

    expect(sending).toEqual([
      { step: NAME, value: 'Nur' },
      { step: OPTIONAL, value: 'skip' },
    ]);
  });

  it('sends the answer, not a skip, when one was typed', () => {
    const sending = stepsToSend(context({ values: { 'policy-number': 'TC-8827' } }));

    expect(sending).toEqual([{ step: OPTIONAL, value: 'TC-8827' }]);
  });

  it('does not re-skip one the server already has an answer for', () => {
    const sending = stepsToSend(context({ answers: { 'policy-number': 'TC-8827' } }));

    expect(sending).toEqual([]);
  });

  /**
   * A required field is never skipped. The server would refuse it, and the
   * refusal belongs under the field as "this is needed" — not sent on the
   * claimant's behalf as though they had declined to answer.
   */
  it('never skips a required field', () => {
    const sending = stepsToSend(context({ values: {} }));

    expect(sending.map(entry => entry.step.id)).toEqual(['policy-number']);
  });

  it('sends a skip as text, whatever the step would otherwise take', () => {
    const date = step('trip-start', { answerType: 'date', optional: true });
    const [turn] = turnsFor(date, 'skip', 'trip-start', ids());

    expect(turn).toEqual({ clientMessageId: 'turn-1', text: 'skip', callbackStepId: 'trip-start' });
  });
});

describe('the turns for one answer', () => {
  /**
   * The cursor move is the thing that is easy to omit and impossible to
   * diagnose: without it the server refuses the answer, and the refusal reads
   * as a validation error on a field that was perfectly fine.
   */
  it('moves the cursor first when the server is on another step', () => {
    const turns = turnsFor(END, '2026-08-19', 'claimant-name', ids());

    expect(turns).toEqual([
      { clientMessageId: 'turn-1', callbackValue: '__edit:trip-end' },
      { clientMessageId: 'turn-2', text: '2026-08-19', callbackStepId: 'trip-end' },
    ]);
  });

  it('sends only the answer when the cursor is already there', () => {
    const turns = turnsFor(END, '2026-08-19', 'trip-end', ids());

    expect(turns).toHaveLength(1);
    expect(turns[0].callbackValue).toBeUndefined();
  });

  /**
   * As a callback, never as text. Typed text would be indistinguishable from a
   * claimant who happened to write "__edit:trip-end" into a field.
   */
  it('sends the cursor move as a callback, not as typed text', () => {
    const [move] = turnsFor(END, 'x', 'claimant-name', ids());

    expect(move.text).toBeUndefined();
    expect(move.callbackValue).toBe('__edit:trip-end');
  });

  it('names a stored document rather than sending its bytes', () => {
    const doc = step('doc-boarding-pass', { answerType: 'document' });
    const turns = turnsFor(doc, 'stored-id-1', 'doc-boarding-pass', ids());

    expect(turns[0]).toEqual({
      clientMessageId: 'turn-1',
      storedDocumentId: 'stored-id-1',
      callbackStepId: 'doc-boarding-pass',
    });
  });

  it('sends a chosen option as a callback value', () => {
    const choice = step('destination', { answerType: 'choice' });
    const turns = turnsFor(choice, 'JP', 'destination', ids());

    expect(turns[0].callbackValue).toBe('JP');
    expect(turns[0].text).toBeUndefined();
  });
});

describe('sending a whole section', () => {
  const build = (outcomes: TurnOutcome[]) => {
    const sent: unknown[] = [];
    let i = 0;
    const send = vi.fn(async (turn: unknown) => {
      sent.push(turn);
      return outcomes[Math.min(i++, outcomes.length - 1)];
    });
    return { send, sent, wait: vi.fn(async () => undefined) };
  };

  const advanced = (to: string | null): TurnOutcome => ({ currentStepId: to, lastReply: null });

  it('accepts a section where every answer moves the cursor on', async () => {
    const deps = build([advanced('trip-start'), advanced('trip-end'), advanced('destination')]);

    const result = await submitSection(
      {
        currentStepId: 'claimant-name',
        values: { 'claimant-name': 'Nur', 'trip-start': '2026-08-12' },
        answers: {},
        steps: [NAME, START],
      },
      { ...deps, newId: ids() }
    );

    expect(result.ok).toBe(true);
    expect(result.accepted).toEqual(['claimant-name', 'trip-start']);
  });

  /**
   * The whole point of stopping. Sending the rest would answer later questions
   * against the wrong steps — the claimant sees one error while four more
   * answers go astray behind it, and the form and the server disagree about
   * what was recorded.
   */
  it('stops at the first refusal and leaves the rest unsent', async () => {
    const deps = build([
      { currentStepId: 'claimant-name', lastReply: 'Please give your full name as on your IC.' },
    ]);

    const result = await submitSection(
      {
        currentStepId: 'claimant-name',
        values: { 'claimant-name': 'X', 'trip-start': '2026-08-12' },
        answers: {},
        steps: [NAME, START],
      },
      { ...deps, newId: ids() }
    );

    expect(result.ok).toBe(false);
    expect(result.accepted).toEqual([]);
    expect(deps.send).toHaveBeenCalledTimes(1);
  });

  it('shows the bot’s own words under the field that caused it', async () => {
    const deps = build([
      { currentStepId: 'trip-end', lastReply: 'That date is before your trip started.' },
    ]);

    const result = await submitSection(
      {
        currentStepId: 'trip-end',
        values: { 'trip-end': '2026-08-01' },
        answers: {},
        steps: [END],
      },
      { ...deps, newId: ids() }
    );

    expect(result.error).toEqual({
      stepId: 'trip-end',
      message: 'That date is before your trip started.',
    });
  });

  it('keeps what was accepted before the refusal', async () => {
    const deps = build([]);
    let call = 0;
    deps.send.mockImplementation(async () => {
      call += 1;
      return call === 1
        ? advanced('trip-start')
        : { currentStepId: 'trip-start', lastReply: 'That is not a date.' };
    });

    const result = await submitSection(
      {
        currentStepId: 'claimant-name',
        values: { 'claimant-name': 'Nur', 'trip-start': 'yesterday' },
        answers: {},
        steps: [NAME, START],
      },
      { ...deps, newId: ids() }
    );

    expect(result.accepted).toEqual(['claimant-name']);
    expect(result.error!.stepId).toBe('trip-start');
  });

  it('sends nothing at all when no field changed', async () => {
    const deps = build([advanced('x')]);

    const result = await submitSection(
      {
        currentStepId: 'claimant-name',
        values: { 'claimant-name': 'Nur' },
        answers: { 'claimant-name': 'Nur' },
        steps: [NAME],
      },
      { ...deps, newId: ids() }
    );

    expect(result.ok).toBe(true);
    expect(deps.send).not.toHaveBeenCalled();
  });
});

describe('the rate limiter', () => {
  /**
   * The exact sentence the gateway sends. Copied from
   * `conversation.gateway.ts`, in the `recentTurns > MAX_TURNS_PER_MINUTE`
   * branch — if that copy is reworded, this test fails, which is the point:
   * the alternative is a silent misdiagnosis in front of a claimant.
   */
  const SERVER_SAYS = 'You are sending messages faster than we can read them. Please wait a moment.';

  it('is recognised from what the server actually sends', () => {
    expect(isRateLimited(SERVER_SAYS)).toBe(true);
  });

  it('is not confused with an ordinary validation message', () => {
    expect(isRateLimited('That date is before your trip started.')).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });

  /**
   * The message is dropped, not queued, so the same turn has to go again — and
   * `clientMessageId` stays the same, because the server dedupes on it and a
   * message that *did* land must not be recorded twice.
   */
  it('retries the identical turn rather than a new one', async () => {
    const sent: Array<{ clientMessageId: string }> = [];
    let call = 0;
    const send = vi.fn(async (turn: { clientMessageId: string }) => {
      sent.push(turn);
      call += 1;
      return call === 1
        ? { currentStepId: 'claimant-name', lastReply: SERVER_SAYS }
        : { currentStepId: 'trip-start', lastReply: null };
    });

    const result = await submitSection(
      {
        currentStepId: 'claimant-name',
        values: { 'claimant-name': 'Nur' },
        answers: {},
        steps: [NAME],
      },
      { send, newId: ids(), wait: vi.fn(async () => undefined) }
    );

    expect(result.ok).toBe(true);
    expect(sent).toHaveLength(2);
    expect(sent[0].clientMessageId).toBe(sent[1].clientMessageId);
  });

  it('waits before retrying rather than hammering', async () => {
    const wait = vi.fn(async () => undefined);
    let call = 0;
    const send = vi.fn(async () => {
      call += 1;
      return call === 1
        ? { currentStepId: 'claimant-name', lastReply: SERVER_SAYS }
        : { currentStepId: 'trip-start', lastReply: null };
    });

    await submitSection(
      {
        currentStepId: 'claimant-name',
        values: { 'claimant-name': 'Nur' },
        answers: {},
        steps: [NAME],
      },
      { send, newId: ids(), wait }
    );

    expect(wait).toHaveBeenCalledTimes(1);
  });

  /**
   * There are two rate limits and they arrive differently. The conversation one
   * (20/minute) replies in-band; the **edge** one (3/second) answers 429 and the
   * transport throws. The second is the one that actually bites — a six-field
   * section is nine requests, because most fields need a cursor move first —
   * and it only showed up by running the form: three answers saved, the fourth
   * threw, and the claimant was left with half a section and no field named.
   */
  it('paces turns so a section does not trip the edge throttle', async () => {
    const wait = vi.fn(async () => undefined);
    const send = vi.fn(async () => ({ currentStepId: 'somewhere-else', lastReply: null }));

    await submitSection(
      {
        currentStepId: 'claimant-name',
        values: { 'claimant-name': 'Nur', 'trip-start': '2026-08-12' },
        answers: {},
        steps: [NAME, START],
      },
      { send, newId: ids(), wait }
    );

    // Three turns — name, then an edit and an answer for trip-start — with a
    // pause between each pair.
    expect(send).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('treats a thrown 429 as the rate limiter, not as a bad answer', async () => {
    let call = 0;
    const send = vi.fn(async () => {
      call += 1;
      if (call === 1) throw { response: { status: 429 } };
      return { currentStepId: 'trip-start', lastReply: null };
    });

    const result = await submitSection(
      {
        currentStepId: 'claimant-name',
        values: { 'claimant-name': 'Nur' },
        answers: {},
        steps: [NAME],
      },
      {
        send,
        newId: ids(),
        wait: vi.fn(async () => undefined),
        isRateLimitError: error => (error as { response?: { status?: number } })?.response?.status === 429,
      }
    );

    expect(result.ok).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
  });

  /**
   * A network failure is not a rate limit. Swallowing it would tell the
   * claimant their answer was refused when in fact it never arrived.
   */
  it('lets a real failure through rather than mistaking it for a throttle', async () => {
    const send = vi.fn(async () => {
      throw new Error('Network Error');
    });

    await expect(
      submitSection(
        {
          currentStepId: 'claimant-name',
          values: { 'claimant-name': 'Nur' },
          answers: {},
          steps: [NAME],
        },
        {
          send,
          newId: ids(),
          wait: vi.fn(async () => undefined),
          isRateLimitError: () => false,
        }
      )
    ).rejects.toThrow('Network Error');
  });

  /**
   * The failure this exists to prevent: blaming a field that was perfectly
   * fine, and sending the claimant to edit a correct answer.
   */
  it('never blames the field when it finally gives up', async () => {
    const send = vi.fn(async () => ({
      currentStepId: 'claimant-name',
      lastReply: SERVER_SAYS,
    }));

    const result = await submitSection(
      {
        currentStepId: 'claimant-name',
        values: { 'claimant-name': 'Nur' },
        answers: {},
        steps: [NAME],
      },
      { send, newId: ids(), wait: vi.fn(async () => undefined), retries: 1 }
    );

    expect(result.ok).toBe(false);
    expect(result.error!.message).toMatch(/too quickly/i);
    expect(result.error!.message).not.toMatch(/faster than we can read/i);
  });
});

/**
 * The bug this exists to stop coming back: a file that arrived, an answer that
 * never did, and a Continue button that silently does nothing about it.
 *
 * Uploading stores the bytes; a separate turn names them as the answer. The id
 * that links the two lives only in the page's memory, so a reload between the
 * two leaves a claimant looking at a row marked "Uploaded" above a button that
 * will never advance — no error, no way forward, and the only escape is to
 * upload the same file a second time.
 */
describe('a document that arrived before the answer did', () => {
  const documentStep = (id: string, optional = false): FlowStep =>
    ({ id, label: id, answerType: 'document', documentType: 'OTHER_DOCUMENT', optional }) as FlowStep;

  it('is answered by naming the step, when nothing was typed this session', () => {
    const sent = stepsToSend({
      currentStepId: 'boarding-pass',
      values: {},
      answers: {},
      steps: [documentStep('boarding-pass')],
      documents: [{ stepId: 'boarding-pass' }],
    });

    expect(sent).toEqual([{ step: expect.objectContaining({ id: 'boarding-pass' }), value: ATTACHED }]);
  });

  it('sends it as text, since the form has no id to carry', () => {
    const turns = turnsFor(documentStep('boarding-pass'), ATTACHED, 'boarding-pass', () => 'id-1');

    expect(turns).toEqual([
      { clientMessageId: 'id-1', text: ATTACHED, callbackStepId: 'boarding-pass' },
    ]);
  });

  /** A file uploaded a moment ago is named by its id, as it always was. */
  it('prefers the id when this session still holds one', () => {
    const sent = stepsToSend({
      currentStepId: 'boarding-pass',
      values: { 'boarding-pass': 'doc-42' },
      answers: {},
      steps: [documentStep('boarding-pass')],
      documents: [{ stepId: 'boarding-pass' }],
    });

    expect(sent).toEqual([{ step: expect.objectContaining({ id: 'boarding-pass' }), value: 'doc-42' }]);
  });

  /** Already answered is already answered — re-sending would attach it twice. */
  it('leaves an answered step alone', () => {
    const sent = stepsToSend({
      currentStepId: 'boarding-pass',
      values: {},
      answers: { 'boarding-pass': 'doc-42' },
      steps: [documentStep('boarding-pass')],
      documents: [{ stepId: 'boarding-pass' }],
    });

    expect(sent).toEqual([]);
  });

  /**
   * With no file, an optional step still skips and a required one still waits
   * for the claimant — the marker must not become a way past either.
   */
  it('does not invent an attachment that is not there', () => {
    const context = { currentStepId: null, values: {}, answers: {}, documents: [] };

    expect(stepsToSend({ ...context, steps: [documentStep('required-one')] })).toEqual([]);
    expect(stepsToSend({ ...context, steps: [documentStep('optional-one', true)] })).toEqual([
      { step: expect.objectContaining({ id: 'optional-one' }), value: 'skip' },
    ]);
  });
});

/**
 * Pressing Continue on a section that has not been filled in.
 *
 * The engine has nothing to send for an empty required field, so nothing went
 * out, nothing came back, and the button did nothing at all — no movement and
 * no message. The same silence as the document that would not attach.
 */
describe('what is still missing from a section', () => {
  const text = (id: string, optional = false): FlowStep =>
    ({ id, label: id, answerType: 'text', optional }) as FlowStep;
  const doc = (id: string): FlowStep =>
    ({ id, label: id, answerType: 'document', documentType: 'OTHER_DOCUMENT' }) as FlowStep;

  const base = { currentStepId: null, values: {}, answers: {}, documents: [] };

  it('names every required question left blank, not just the first', () => {
    const missing = missingRequired({ ...base, steps: [text('a'), text('b'), text('c')] });

    expect(missing.map(step => step.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves optional questions alone', () => {
    const missing = missingRequired({ ...base, steps: [text('a'), text('opt', true)] });

    expect(missing.map(step => step.id)).toEqual(['a']);
  });

  it('counts what has just been typed', () => {
    const missing = missingRequired({ ...base, values: { a: 'Nur' }, steps: [text('a')] });

    expect(missing).toEqual([]);
  });

  /** Coming back to a finished section must not be blocked by it. */
  it('counts what the server already holds', () => {
    const missing = missingRequired({ ...base, answers: { a: 'Nur' }, steps: [text('a')] });

    expect(missing).toEqual([]);
  });

  it('does not accept whitespace as an answer', () => {
    const missing = missingRequired({ ...base, values: { a: '   ' }, steps: [text('a')] });

    expect(missing.map(step => step.id)).toEqual(['a']);
  });

  /** A file that has arrived is an answer, even before the turn naming it. */
  it('counts an attached document', () => {
    expect(missingRequired({ ...base, steps: [doc('d')] }).map(s => s.id)).toEqual(['d']);
    expect(
      missingRequired({ ...base, steps: [doc('d')], documents: [{ stepId: 'd' }] })
    ).toEqual([]);
  });
});
