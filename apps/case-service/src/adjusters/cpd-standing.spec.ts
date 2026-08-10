import { CPD_ANNUAL_FLOOR_HOURS, cpdAdvisory, cpdStanding } from './cpd-standing';

/**
 * COMPLIANCE TESTS — PD 12.10's fifteen-hour CPD floor and PD 12.11's
 * qualifying-programme rule.
 */
describe('CPD standing (PD 12.9–12.11)', () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const entry = (hours: number, recognised = true, year = 2025) => ({
    year,
    hours,
    providerRecognised: recognised,
  });

  it('holds the floor at fifteen hours', () => {
    expect(CPD_ANNUAL_FLOOR_HOURS).toBe(15);
  });

  describe('what counts', () => {
    it('counts only recognised-provider hours toward the floor (12.11)', () => {
      // Twenty hours attended, but only ten qualify: the floor is unmet. The
      // unrecognised hours are still on the record — true, but not the currency.
      const standing = cpdStanding([entry(10, true), entry(10, false)], 2025, at('2026-02-01'));

      expect(standing.hoursRecorded).toBe(20);
      expect(standing.hoursQualifying).toBe(10);
      expect(standing.verdict).toBe('SHORTFALL');
    });

    it('ignores hours from other years', () => {
      const standing = cpdStanding([entry(15, true, 2024)], 2025, at('2026-02-01'));

      expect(standing.hoursQualifying).toBe(0);
    });

    it('sums fractional hours without floating-point noise', () => {
      const standing = cpdStanding(
        [entry(7.5), entry(4.5), entry(3.5)],
        2025,
        at('2026-02-01')
      );

      expect(standing.hoursQualifying).toBe(15.5);
      expect(standing.verdict).toBe('MET');
    });
  });

  describe('open vs closed years', () => {
    it('never calls an open year a shortfall', () => {
      // February with two hours is not a finding; December with two hours is
      // close to one, but the year can still be met. SHORTFALL is reserved for
      // a closed year — otherwise the dashboard cries wolf all spring.
      const standing = cpdStanding([entry(2)], 2025, at('2025-02-15'));

      expect(standing.verdict).not.toBe('SHORTFALL');
    });

    it('reports on-track against the pro-rata expectation', () => {
      expect(cpdStanding([entry(8)], 2025, at('2025-06-15')).verdict).toBe('ON_TRACK');
      expect(cpdStanding([entry(2)], 2025, at('2025-10-01')).verdict).toBe('BEHIND');
    });

    it('marks a closed year with a shortfall as SHORTFALL', () => {
      expect(cpdStanding([entry(14.5)], 2025, at('2026-01-05')).verdict).toBe('SHORTFALL');
    });

    it('marks MET as soon as the floor is reached, even mid-year', () => {
      expect(cpdStanding([entry(15)], 2025, at('2025-03-01')).verdict).toBe('MET');
    });

    it('handles an empty ledger for a closed year', () => {
      const standing = cpdStanding([], 2024, at('2026-01-01'));

      expect(standing.hoursQualifying).toBe(0);
      expect(standing.verdict).toBe('SHORTFALL');
    });
  });

  describe('the advisory', () => {
    it('speaks only on a closed-year shortfall', () => {
      expect(cpdAdvisory(cpdStanding([entry(15)], 2025, at('2026-02-01')))).toBeNull();
      expect(cpdAdvisory(cpdStanding([entry(3)], 2025, at('2025-06-01')))).toBeNull();

      const advisory = cpdAdvisory(cpdStanding([entry(3)], 2025, at('2026-02-01')));
      expect(advisory).toMatch(/3 of 15/);
      expect(advisory).toMatch(/12\.10/);
    });
  });
});
