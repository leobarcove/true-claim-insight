import {
  SENIOR_YEARS_FLOOR,
  assignmentEligibility,
  canRecogniseSenior,
  underSupervision,
} from './adjuster-competency';

/**
 * COMPLIANCE TESTS — PD 12.1–12.4: supervision, senior recognition, assignment.
 *
 * These rules decide who may do which adjusting work. The recurring theme is
 * that standing is never assumed: unknown data reads as the safer state, and
 * senior is something a named person grants, not something arithmetic confers.
 */
describe('Adjuster competency (PD 12.1–12.4)', () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

  describe('the PD 12.3 supervision year', () => {
    it('holds a new adjusting employee under supervision for one year', () => {
      expect(underSupervision(at('2026-01-01'), at('2026-06-30'))).toBe(true);
      expect(underSupervision(at('2026-01-01'), at('2027-01-01'))).toBe(false);
    });

    it('reads an unknown start date as under supervision — the safe default', () => {
      // The cost of being wrong here is a countersign; the alternative is
      // unsupervised work by someone whose first day nobody recorded.
      expect(underSupervision(null, at('2026-06-30'))).toBe(true);
      expect(underSupervision(undefined, at('2026-06-30'))).toBe(true);
    });
  });

  describe('the PD 12.4 recognition act', () => {
    const competency = (over: Partial<Parameters<typeof canRecogniseSenior>[0]> = {}) => ({
      yearsInSubject: 7,
      casesHandled: 120,
      performanceSatisfactory: true,
      seniorRecognisedAt: null,
      ...over,
    });

    it('refuses below the five-year floor — 12.4(a) is a shall', () => {
      const decision = canRecogniseSenior(competency({ yearsInSubject: 4 }));

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toMatch(/12\.4\(a\)/);
      expect(SENIOR_YEARS_FLOOR).toBe(5);
    });

    it('refuses with no recorded cases — 12.4(b)(i) must have something to weigh', () => {
      expect(canRecogniseSenior(competency({ casesHandled: 0 })).allowed).toBe(false);
    });

    it('refuses without attested performance — 12.4(b)(ii)', () => {
      expect(canRecogniseSenior(competency({ performanceSatisfactory: false })).allowed).toBe(false);
    });

    it('allows recognition when floor and considerations are all present', () => {
      expect(canRecogniseSenior(competency()).allowed).toBe(true);
    });
  });

  describe('assignment eligibility (PD 12.1, 12.2(b))', () => {
    const input = (over: Partial<Parameters<typeof assignmentEligibility>[0]> = {}) => ({
      adjusterStatus: 'ACTIVE',
      licenseVerifiedAt: at('2026-01-01'),
      competency: {
        yearsInSubject: 7,
        casesHandled: 100,
        performanceSatisfactory: true,
        seniorRecognisedAt: at('2026-01-01'),
      },
      licensedMode: false,
      ...over,
    });

    it('refuses a suspended adjuster in every mode — not a licence question', () => {
      for (const licensedMode of [false, true]) {
        const result = assignmentEligibility(input({ adjusterStatus: 'SUSPENDED', licensedMode }));

        expect(result.allowed).toBe(false);
        expect(result.reason).toMatch(/SUSPENDED/);
      }
    });

    it('records advisories in TPA mode rather than blocking', () => {
      // The licence flip applied to people: the same gaps that will block on
      // registration are recorded now, so the firm arrives with the habit and
      // the history.
      const result = assignmentEligibility(
        input({ licenseVerifiedAt: null, competency: null, licensedMode: false })
      );

      expect(result.allowed).toBe(true);
      expect(result.advisories).toHaveLength(2);
      expect(result.advisories.join(' ')).toMatch(/12\.2\(b\)/);
    });

    it('blocks the same gaps once registered', () => {
      const result = assignmentEligibility(
        input({ licenseVerifiedAt: null, competency: null, licensedMode: true })
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/12\.2\(b\)/);
    });

    it('passes clean in registered mode when licence and competency are in place', () => {
      const result = assignmentEligibility(input({ licensedMode: true }));

      expect(result.allowed).toBe(true);
      expect(result.advisories).toEqual([]);
    });
  });
});
