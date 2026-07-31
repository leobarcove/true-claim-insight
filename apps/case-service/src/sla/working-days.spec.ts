import { withVerifiedYear } from './holiday-test-support';
import {
  MALAYSIAN_HOLIDAYS,
  UnverifiedHolidayYearError,
  addWorkingDays,
  isWeekend,
  isWorkingDay,
  workingDaysBetween,
} from './working-days';

/**
 * COMPLIANCE TESTS — working-day arithmetic underpins every CSP and PD 12.5
 * turnaround obligation (docs/MASTER_PLAN.md §3.2). A bug here does not look
 * like a bug; it looks like a deadline the firm believed it had met.
 */
describe('Malaysian working days', () => {
  const d = (isoDate: string) => new Date(`${isoDate}T00:00:00Z`);

  describe('refusing to guess', () => {
    it('throws rather than computing a deadline in a year with no data', () => {
      // 2027 has no entry until its gazette is published, so the engine refuses
      // rather than treating unlisted lunar holidays as working days.
      expect(MALAYSIAN_HOLIDAYS[2027]).toBeUndefined();
      expect(() => addWorkingDays(d('2027-03-02'), 10)).toThrow(UnverifiedHolidayYearError);
    });

    it('records the provenance of every year it will compute in', () => {
      // A year marked verified with no stated source is how a guessed list gets
      // laundered into an authoritative one.
      for (const [year, entry] of Object.entries(MALAYSIAN_HOLIDAYS)) {
        if (!entry.verifiedAgainstGazette) continue;
        expect(entry.source.trim().length).toBeGreaterThan(30);
        expect(`${year} has holidays`).toBeTruthy();
        expect(entry.holidays.length).toBeGreaterThan(10);
      }
    });

    it('throws for a year with no holiday data at all', () => {
      expect(() => isWorkingDay(d('2031-06-10'))).toThrow(UnverifiedHolidayYearError);
    });

    it('names the year and tells the reader how to fix it', () => {
      expect(() => addWorkingDays(d('2027-03-02'), 1)).toThrow(/2027/);
      expect(() => addWorkingDays(d('2027-03-02'), 1)).toThrow(/gazette/i);
    });

    it('now computes real 2026 deadlines, and skips a gazetted holiday', () => {
      // Merdeka falls on Monday 31 August 2026, so a one-day deadline from
      // Friday 28 August lands on Tuesday 1 September rather than the Monday.
      expect(addWorkingDays(d('2026-08-28'), 1, { state: 'KUALA_LUMPUR' }).toISOString().slice(0, 10)).toBe(
        '2026-09-01'
      );
    });
  });

  describe('weekend patterns', () => {
    // 2026-03-06 is a Friday, 07 Saturday, 08 Sunday, 09 Monday.
    it('treats Saturday and Sunday as the weekend nationally', () => {
      expect(isWeekend(d('2026-03-07'))).toBe(true);
      expect(isWeekend(d('2026-03-08'))).toBe(true);
      expect(isWeekend(d('2026-03-06'))).toBe(false);
    });

    it('treats Friday and Saturday as the weekend in Johor, Kedah, Kelantan and Terengganu', () => {
      for (const state of ['JOHOR', 'KEDAH', 'KELANTAN', 'TERENGGANU']) {
        expect(isWeekend(d('2026-03-06'), { state })).toBe(true);
        expect(isWeekend(d('2026-03-07'), { state })).toBe(true);
        expect(isWeekend(d('2026-03-08'), { state })).toBe(false);
      }
    });

    it('uses the Saturday–Sunday pattern for a state that is not on the Friday list', () => {
      expect(isWeekend(d('2026-03-06'), { state: 'SELANGOR' })).toBe(false);
      expect(isWeekend(d('2026-03-08'), { state: 'SELANGOR' })).toBe(true);
    });
  });

  describe('counting forward', () => {
    it('never counts the start date — one working day from Friday is Monday', () => {
      withVerifiedYear(2026, [], () => {
        expect(addWorkingDays(d('2026-03-06'), 1).toISOString().slice(0, 10)).toBe('2026-03-09');
      });
    });

    it('skips the weekend when counting the CSP ten-day final-report window', () => {
      withVerifiedYear(2026, [], () => {
        // Mon 2 Mar + 10 working days = Mon 16 Mar (two weekends skipped).
        expect(addWorkingDays(d('2026-03-02'), 10).toISOString().slice(0, 10)).toBe('2026-03-16');
      });
    });

    it('skips a gazetted national holiday', () => {
      withVerifiedYear(2026, [{ date: '2026-03-10', name: 'Test National Holiday' }], () => {
        // Mon 9 + 2 working days would be Wed 11, but Tue 10 is a holiday → Thu 12.
        expect(addWorkingDays(d('2026-03-09'), 2).toISOString().slice(0, 10)).toBe('2026-03-12');
      });
    });

    it('applies a state holiday only in that state', () => {
      withVerifiedYear(
        2026,
        [{ date: '2026-03-10', name: 'Ruler’s Birthday', states: ['SELANGOR'] }],
        () => {
          expect(addWorkingDays(d('2026-03-09'), 2, { state: 'SELANGOR' }).toISOString().slice(0, 10)).toBe(
            '2026-03-12'
          );
          expect(addWorkingDays(d('2026-03-09'), 2, { state: 'PENANG' }).toISOString().slice(0, 10)).toBe(
            '2026-03-11'
          );
        }
      );
    });

    it('returns the start date unchanged for a count of zero', () => {
      withVerifiedYear(2026, [], () => {
        expect(addWorkingDays(d('2026-03-09'), 0).toISOString()).toBe(d('2026-03-09').toISOString());
      });
    });

    it('rejects a negative or fractional count rather than looping', () => {
      withVerifiedYear(2026, [], () => {
        expect(() => addWorkingDays(d('2026-03-09'), -1)).toThrow(RangeError);
        expect(() => addWorkingDays(d('2026-03-09'), 1.5)).toThrow(RangeError);
      });
    });

    it('does not mutate the date it was given', () => {
      withVerifiedYear(2026, [], () => {
        const start = d('2026-03-09');
        addWorkingDays(start, 5);
        expect(start.toISOString()).toBe('2026-03-09T00:00:00.000Z');
      });
    });
  });

  describe('measuring elapsed time', () => {
    it('counts working days between two dates, excluding the start', () => {
      withVerifiedYear(2026, [], () => {
        expect(workingDaysBetween(d('2026-03-02'), d('2026-03-16'))).toBe(10);
      });
    });

    it('is the inverse of addWorkingDays', () => {
      withVerifiedYear(2026, [{ date: '2026-03-10', name: 'Test Holiday' }], () => {
        const start = d('2026-03-02');
        const due = addWorkingDays(start, 7);
        expect(workingDaysBetween(start, due)).toBe(7);
      });
    });

    it('reports lateness as a negative count when the dates are reversed', () => {
      withVerifiedYear(2026, [], () => {
        expect(workingDaysBetween(d('2026-03-16'), d('2026-03-02'))).toBe(-10);
      });
    });

    it('is zero across a weekend with no working day in between', () => {
      withVerifiedYear(2026, [], () => {
        expect(workingDaysBetween(d('2026-03-07'), d('2026-03-08'))).toBe(0);
      });
    });
  });
});
