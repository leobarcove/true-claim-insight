import {
  asStoredInstant,
  computeDeadlineFlags,
  formatDateAnswer,
  parseStoredDate,
  validateAnswer,
  type FlowStep,
} from '@tci/shared-types';

/**
 * REGRESSION TEST — the same wall clock must mean the same instant.
 *
 * Intake records the time the claimant experienced and reads it back with UTC
 * getters. Only some inputs said so: `parseTextDate` carries a `Z`, while the
 * PWA's `<input type="datetime-local">` hands over `2026-08-18T10:00` with no
 * designator — and ECMA-262 reads a date-*time* without one as **local**, while
 * reading a date-only form as UTC.
 *
 * So a 10:00 incident was two different instants depending on which surface the
 * claimant used. On a UTC+8 server the naive one lands eight hours early, which
 * is enough to mark someone who notified inside the CSP 24-hour window as late,
 * with nothing on screen to explain it.
 *
 * Found by walking a claim end to end, not by a unit test: every layer was
 * internally consistent and the review summary simply showed the wrong time.
 */
const NAIVE = '2026-08-18T10:00';
const ZULU = '2026-08-18T10:00:00.000Z';

describe('a datetime with no timezone is read as the time that was typed', () => {
  it('marks a naive value as UTC rather than converting it', () => {
    // Marked, not shifted: 10:00 has to keep meaning 10:00, or the fix would
    // move every claimant's incident by the server's offset instead.
    expect(asStoredInstant(NAIVE)).toBe('2026-08-18T10:00Z');
    expect(parseStoredDate(NAIVE).toISOString()).toBe(ZULU);
  });

  it.each([ZULU, '2026-08-18T10:00+08:00', '2026-08-18', 'not a date'])(
    'leaves %s alone',
    value => {
      expect(asStoredInstant(value)).toBe(value);
    }
  );

  it('reads both shapes as the same instant', () => {
    expect(parseStoredDate(NAIVE).getTime()).toBe(parseStoredDate(ZULU).getTime());
  });
});

describe('the CSP notification clock', () => {
  // Twenty hours after a 10:00 incident — comfortably inside the 24-hour
  // window, and the exact case that was being flagged late.
  const twentyHoursLater = new Date('2026-08-19T06:00:00.000Z');

  it('does not depend on which surface the claimant used', () => {
    const fromApp = computeDeadlineFlags(NAIVE, twentyHoursLater);
    const fromChat = computeDeadlineFlags(ZULU, twentyHoursLater);

    expect(fromApp.notifiedLate).toBe(false);
    expect({ late: fromApp.notifiedLate, out: fromApp.outOfWindow }).toEqual({
      late: fromChat.notifiedLate,
      out: fromChat.outOfWindow,
    });
  });

  it('still flags a genuinely late notification', () => {
    // The control. A fix that simply stopped flagging would pass the test
    // above and destroy the reason the flag exists.
    const twoDaysLater = new Date('2026-08-20T10:00:00.000Z');
    expect(computeDeadlineFlags(NAIVE, twoDaysLater).notifiedLate).toBe(true);
  });
});

describe('the review summary shows the time the claimant entered', () => {
  it('renders a naive value as the wall clock it records', () => {
    // This is the one screen where a claimant checks the facts of their own
    // claim. Showing 02:00 for a 10:00 incident and asking them to confirm is
    // worse than showing nothing, because it looks authoritative.
    expect(formatDateAnswer(NAIVE, 'datetime')).toBe('18 August 2026 at 10:00');
    expect(formatDateAnswer(NAIVE, 'datetime')).toBe(formatDateAnswer(ZULU, 'datetime'));
  });
});

describe('answers are still compared against each other correctly', () => {
  const step = (id: string): FlowStep =>
    ({ id, prompt: '', label: '', answerType: 'datetime', next: { type: 'end' } }) as FlowStep;

  it('does not invent a contradiction between two shapes of the same day', () => {
    // `scheduled-departure` and `actual-departure` are compared as instants.
    // Mixing a naive value with a Z-suffixed one differed by the server's
    // offset, which could reject a true answer as "the flight left early".
    const result = validateAnswer(step('actual-departure'), '2026-08-18T15:00', {
      answers: { 'scheduled-departure': '2026-08-18T09:00:00.000Z' },
    });
    expect(result.valid).toBe(true);
  });

  it('still catches a real contradiction', () => {
    const result = validateAnswer(step('actual-departure'), '2026-08-18T07:00', {
      answers: { 'scheduled-departure': '2026-08-18T09:00:00.000Z' },
    });
    expect(result.valid).toBe(false);
  });
});
