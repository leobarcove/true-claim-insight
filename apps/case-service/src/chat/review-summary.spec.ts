import {
  CASE_FLOWS,
  formatDateAnswer,
  summariseAnswers,
  type CaseAnswers,
} from '@tci/shared-types';

/**
 * The review summary is the one moment a claimant is asked to check the facts
 * of their own claim before it is filed. It printed dates as stored ISO —
 * "Trip start date: 2026-08-11T00:00:00.000Z" — which is not a cosmetic
 * complaint: an unreadable summary is one nobody reads, and confirming it is
 * what submits the claim.
 */
describe('review summary', () => {
  describe('formatDateAnswer', () => {
    it('spells the month, because 11/08 and 08/11 look alike', () => {
      expect(formatDateAnswer('2026-08-11T00:00:00.000Z', 'date')).toBe('11 August 2026');
    });

    it('keeps the time on a datetime', () => {
      expect(formatDateAnswer('2026-08-11T15:00:00.000Z', 'datetime')).toBe(
        '11 August 2026 at 15:00'
      );
    });

    it('reads back the clock time the claimant typed', () => {
      // Intake stores what was typed without applying an offset, so this must
      // render in UTC. Anything local would move a 10:00 incident to 18:00 in
      // Malaysia and invite the claimant to "correct" a right answer.
      expect(formatDateAnswer('2026-08-11T10:00:00.000Z', 'datetime')).toContain('10:00');
    });

    it('uses a 24-hour clock, matching how the question is asked', () => {
      expect(formatDateAnswer('2026-08-11T15:00:00.000Z', 'datetime')).not.toMatch(/pm|PM/);
    });

    it('returns null on an unparseable value rather than "Invalid Date"', () => {
      expect(formatDateAnswer('not a date', 'date')).toBeNull();
    });
  });

  describe('summariseAnswers', () => {
    const steps = CASE_FLOWS.FLIGHT_DELAY.steps;
    const answers: CaseAnswers = {
      'claimant-name': 'Leo Boey',
      'policy-number': 'PNT000007',
      'trip-start': '2026-08-11T00:00:00.000Z',
      'trip-end': '2026-08-14T00:00:00.000Z',
      'destination': 'SG',
      'incident-date': '2026-08-11T10:00:00.000Z',
      'scheduled-departure': '2026-08-11T10:00:00.000Z',
      'actual-departure': '2026-08-11T15:00:00.000Z',
      'doc-boarding-pass': 'some-document-id',
      'bank-account-number': '••••3123',
    };

    const summary = () => summariseAnswers(steps, answers);

    it('shows no raw ISO timestamps at all', () => {
      expect(summary()).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    });

    it('renders each kind of date readably', () => {
      expect(summary()).toContain('Trip start date: 11 August 2026');
      expect(summary()).toContain('Incident date and time: 11 August 2026 at 10:00');
    });

    it('still hides what should stay hidden', () => {
      const text = summary();
      // A document id means nothing to a claimant; the mask is applied before
      // the answers reach here and must not be undone by the formatting.
      expect(text).toContain('Boarding pass: provided');
      expect(text).not.toContain('some-document-id');
      expect(text).toContain('••••3123');
    });

    it('leads with the claimant’s own name', () => {
      expect(summary().split('\n')[0]).toBe('• Full name: Leo Boey');
    });
  });
});
