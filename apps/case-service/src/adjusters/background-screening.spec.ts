import { MINIMUM_CHECKS, screeningAdvisory, screeningStanding } from './background-screening';

/**
 * COMPLIANCE TESTS — PD 11.2(e) pre-employment screening.
 *
 * The paragraph names its own minimum; the tests hold "screened" to that
 * definition and keep the honesty rules honest: OTHER never substitutes, a
 * late check is counted but flagged, and FINDINGS is visible rather than
 * disqualifying.
 */
describe('Background screening (PD 11.2(e))', () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const check = (checkType: string, over: Partial<{ outcome: string; screenedAt: Date }> = {}) => ({
    checkType,
    outcome: 'CLEAR',
    screenedAt: at('2019-02-01'),
    ...over,
  });
  const allFour = () => MINIMUM_CHECKS.map(kind => check(kind));

  it('pins the minimum to the four checks 11.2(e) names', () => {
    expect([...MINIMUM_CHECKS].sort()).toEqual([
      'ACADEMIC_HISTORY',
      'BANKRUPTCY_INSOLVENCY',
      'CRIMINAL_SCREENING',
      'EMPLOYMENT_HISTORY',
    ]);
  });

  it('is complete only when every minimum check has a record', () => {
    const standing = screeningStanding(allFour().slice(0, 3), at('2019-03-01'));

    expect(standing.complete).toBe(false);
    expect(standing.missing).toEqual(['CRIMINAL_SCREENING']);
  });

  it('does not let an OTHER check substitute for a named one', () => {
    const standing = screeningStanding(
      [...allFour().slice(0, 3), check('OTHER')],
      at('2019-03-01')
    );

    expect(standing.complete).toBe(false);
  });

  describe('prior to employment', () => {
    it('flags a check performed after employment began, but still counts it', () => {
      // Late assurance is assurance — the standing is complete — but "prior to
      // employment" it was not, and the record says so rather than blurring it.
      const entries = [
        ...allFour().slice(0, 3),
        check('CRIMINAL_SCREENING', { screenedAt: at('2020-06-01') }),
      ];
      const standing = screeningStanding(entries, at('2019-03-01'));

      expect(standing.complete).toBe(true);
      expect(standing.late).toEqual(['CRIMINAL_SCREENING']);
    });

    it('judges lateness by the earliest record of each kind', () => {
      const entries = [
        ...allFour(),
        check('CRIMINAL_SCREENING', { screenedAt: at('2022-01-01') }),
      ];

      // A pre-employment check followed by a later re-check is not "late".
      expect(screeningStanding(entries, at('2019-03-01')).late).toEqual([]);
    });

    it('flags nothing as late when the employment start is unknown', () => {
      // Without a start date there is no "prior to" to measure against; the
      // supervision default already punishes the missing date elsewhere.
      expect(screeningStanding(allFour(), null).late).toEqual([]);
    });
  });

  describe('findings', () => {
    it('surfaces FINDINGS without treating them as failure', () => {
      const entries = [
        ...allFour().slice(0, 3),
        check('BANKRUPTCY_INSOLVENCY', { outcome: 'FINDINGS' }),
      ];
      const standing = screeningStanding(entries, at('2019-03-01'));

      // "We found it, considered it and proceeded" is the protective record.
      expect(standing.complete).toBe(false); // still missing CRIMINAL_SCREENING
      expect(standing.withFindings).toEqual(['BANKRUPTCY_INSOLVENCY']);
    });
  });

  describe('the advisory', () => {
    it('names what is missing and cites the paragraph', () => {
      const advisory = screeningAdvisory(screeningStanding([], at('2019-03-01')));

      expect(advisory).toMatch(/11\.2\(e\)/);
      expect(advisory).toContain('BANKRUPTCY_INSOLVENCY');
    });

    it('is silent when the minimum set is on record', () => {
      expect(screeningAdvisory(screeningStanding(allFour(), at('2019-03-01')))).toBeNull();
    });
  });
});
