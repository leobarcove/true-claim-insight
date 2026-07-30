import { at, dateOf, withVerifiedYear } from './holiday-test-support';
import {
  dueDateAfterResume,
  dueDateFor,
  escalationLevelFor,
  isBreached,
  remainingWorkingDays,
  shouldWarn,
  type SlaTarget,
} from './sla.calculator';

/**
 * COMPLIANCE TESTS — these functions decide whether the firm met a BNM
 * turnaround obligation (CSP PD 029-69; Adjuster PD 12.5, docs/MASTER_PLAN.md
 * §3.2). A defect here does not present as a bug; it presents as a deadline the
 * firm believed it had met, or a breach it is blamed for but did not cause.
 */
describe('SLA calculator', () => {
  const target = (over: Partial<SlaTarget> = {}): SlaTarget => ({
    workingDays: 10,
    warnWorkingDaysBefore: 2,
    calendarState: null,
    ...over,
  });

  describe('deadlines', () => {
    it('computes the CSP ten-working-day final-report deadline', () => {
      withVerifiedYear(2026, [], () => {
        // Mon 2 Mar + 10 working days = Mon 16 Mar.
        expect(dateOf(dueDateFor(at('2026-03-02'), target()))).toBe('2026-03-16');
      });
    });

    it('honours a state calendar with a Friday–Saturday weekend', () => {
      withVerifiedYear(2026, [], () => {
        // Counted from Thursday 5 March. Note that a five-day target would land
        // on the same date under either pattern — five working days advance a
        // full week whichever two days are the weekend — so the assertion has to
        // use a span short enough for the weekend position to matter.
        const oneDay = target({ workingDays: 1 });

        expect(dateOf(dueDateFor(at('2026-03-05'), oneDay))).toBe('2026-03-06');
        expect(dateOf(dueDateFor(at('2026-03-05'), { ...oneDay, calendarState: 'JOHOR' }))).toBe(
          '2026-03-08'
        );
      });
    });

    it('pushes the deadline past a gazetted holiday', () => {
      const holiday = [{ date: '2026-03-10', name: 'Test Holiday' }];
      withVerifiedYear(2026, [], () => {
        expect(dateOf(dueDateFor(at('2026-03-09'), target({ workingDays: 2 })))).toBe('2026-03-11');
      });
      withVerifiedYear(2026, holiday, () => {
        expect(dateOf(dueDateFor(at('2026-03-09'), target({ workingDays: 2 })))).toBe('2026-03-12');
      });
    });
  });

  describe('time remaining', () => {
    it('counts down in working days', () => {
      withVerifiedYear(2026, [], () => {
        expect(remainingWorkingDays(at('2026-03-09'), at('2026-03-16'), target())).toBe(5);
      });
    });

    it('goes negative once the deadline has passed, so lateness needs no separate maths', () => {
      withVerifiedYear(2026, [], () => {
        expect(remainingWorkingDays(at('2026-03-18'), at('2026-03-16'), target())).toBe(-2);
      });
    });
  });

  describe('pausing does not consume the firm’s time', () => {
    it('grants the remaining working days again from the resume date', () => {
      withVerifiedYear(2026, [], () => {
        const started = at('2026-03-02');
        const due = dueDateFor(started, target()); // 16 Mar, 10 working days

        // Paused on 4 Mar with 8 working days left, resumed a fortnight later.
        const remaining = remainingWorkingDays(at('2026-03-04'), due, target());
        expect(remaining).toBe(8);

        const resumedDue = dueDateAfterResume(at('2026-03-18'), remaining, target());
        expect(remainingWorkingDays(at('2026-03-18'), resumedDue, target())).toBe(8);
      });
    });

    it('does not resurrect a deadline that had already expired when paused', () => {
      withVerifiedYear(2026, [], () => {
        // Negative remaining (paused after the deadline) must not hand back time.
        const resumedDue = dueDateAfterResume(at('2026-03-18'), -3, target());
        expect(dateOf(resumedDue)).toBe('2026-03-18');
      });
    });
  });

  describe('due-soon warnings', () => {
    it('fires inside the warning window', () => {
      withVerifiedYear(2026, [], () => {
        // 2 working days before Mon 16 Mar is Thu 12 Mar.
        expect(shouldWarn(at('2026-03-12'), at('2026-03-16'), target(), false)).toBe(true);
      });
    });

    it('stays quiet while the deadline is still far off', () => {
      withVerifiedYear(2026, [], () => {
        expect(shouldWarn(at('2026-03-04'), at('2026-03-16'), target(), false)).toBe(false);
      });
    });

    it('fires only once', () => {
      withVerifiedYear(2026, [], () => {
        expect(shouldWarn(at('2026-03-12'), at('2026-03-16'), target(), true)).toBe(false);
      });
    });

    it('is suppressed for a one-day SLA, which cannot be warned a day in advance', () => {
      withVerifiedYear(2026, [], () => {
        const ack = target({ workingDays: 1, warnWorkingDaysBefore: 1 });
        expect(shouldWarn(at('2026-03-09'), at('2026-03-10'), ack, false)).toBe(false);
      });
    });

    it('does not warn about a deadline that has already passed — that is a breach', () => {
      withVerifiedYear(2026, [], () => {
        expect(shouldWarn(at('2026-03-18'), at('2026-03-16'), target(), false)).toBe(false);
      });
    });
  });

  describe('breach detection', () => {
    it('does not treat the deadline instant itself as a breach', () => {
      const due = at('2026-03-16');
      expect(isBreached(due, due)).toBe(false);
      expect(isBreached(new Date(due.getTime() + 1), due)).toBe(true);
    });
  });

  describe('escalation', () => {
    it('steps at breach, two working days, and five', () => {
      expect(escalationLevelFor(0)).toBe(1);
      expect(escalationLevelFor(1)).toBe(1);
      expect(escalationLevelFor(2)).toBe(2);
      expect(escalationLevelFor(4)).toBe(2);
      expect(escalationLevelFor(5)).toBe(3);
      expect(escalationLevelFor(40)).toBe(3);
    });

    it('never exceeds level 3, so escalation cannot drift past the Board step', () => {
      for (const late of [0, 1, 3, 7, 90, 365]) {
        expect(escalationLevelFor(late)).toBeLessThanOrEqual(3);
      }
    });
  });
});
