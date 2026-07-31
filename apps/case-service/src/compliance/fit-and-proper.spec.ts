import {
  CRITERIA_10_1,
  CRITERIA_10_2,
  applicableCriteria,
  fitStanding,
  validateAttestation,
} from './fit-and-proper';

/**
 * COMPLIANCE TESTS — PD 10.1/10.2 fit-and-proper criteria.
 *
 * The criteria are transcribed from the paragraphs; these tests pin the count
 * and coverage so a criterion cannot be quietly dropped, and hold the honesty
 * rules: silence is not attestation, and NOT_MET must be described.
 */
describe('Fit and proper (PD 10.1/10.2)', () => {
  const allMet = (codes: string[]) =>
    Object.fromEntries(codes.map(code => [code, { outcome: 'MET' as const }]));
  const codes101 = CRITERIA_10_1.map(criterion => criterion.code);
  const codesAll = [...codes101, ...CRITERIA_10_2.map(criterion => criterion.code)];

  it('pins the criteria to the paragraphs: four in 10.1, six in 10.2', () => {
    expect(codes101).toEqual(['10.1a', '10.1b', '10.1c', '10.1d']);
    expect(CRITERIA_10_2.map(criterion => criterion.code)).toEqual([
      '10.2a',
      '10.2b',
      '10.2c',
      '10.2d',
      '10.2e',
      '10.2f',
    ]);
  });

  describe('who answers what', () => {
    it('holds a shareholder to 10.1 only', () => {
      expect(applicableCriteria('SHAREHOLDER').map(criterion => criterion.code)).toEqual(codes101);
    });

    it('holds a KRP to 10.1 and 10.2 both', () => {
      expect(applicableCriteria('KRP')).toHaveLength(10);
      expect(applicableCriteria('SHAREHOLDER_AND_KRP')).toHaveLength(10);
    });
  });

  describe('validation', () => {
    it('refuses silence — every applicable criterion must be answered', () => {
      const responses = allMet(codes101.slice(0, 3));
      const validation = validateAttestation('SHAREHOLDER', responses);

      expect(validation.valid).toBe(false);
      expect(validation.missing).toEqual(['10.1d']);
    });

    it('does not let a shareholder attestation satisfy a KRP', () => {
      const validation = validateAttestation('KRP', allMet(codes101));

      expect(validation.valid).toBe(false);
      expect(validation.missing).toHaveLength(6);
    });

    it('requires a NOT_MET to be described', () => {
      const responses = {
        ...allMet(codes101),
        '10.1b': { outcome: 'NOT_MET' as const },
      };
      const validation = validateAttestation('SHAREHOLDER', responses);

      expect(validation.valid).toBe(false);
      expect(validation.notMetWithoutNote).toEqual(['10.1b']);
    });

    it('accepts a described NOT_MET — the honest finding is the point', () => {
      const responses = {
        ...allMet(codes101),
        '10.1b': { outcome: 'NOT_MET' as const, note: 'Bankruptcy order 2024, undischarged' },
      };
      const validation = validateAttestation('SHAREHOLDER', responses);

      expect(validation.valid).toBe(true);
      expect(validation.notMet).toEqual(['10.1b']);
    });

    it('passes a complete all-met KRP attestation', () => {
      const validation = validateAttestation('KRP', allMet(codesAll));

      expect(validation.valid).toBe(true);
      expect(validation.notMet).toEqual([]);
    });
  });

  describe('standing', () => {
    const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

    it('reads never-attested as its own state, not as fit', () => {
      expect(fitStanding(null, at('2026-07-31'))).toBe('NEVER_ATTESTED');
    });

    it('is FIT within the annual cycle and DUE after it', () => {
      const latest = { attestedAt: at('2026-01-15'), allMet: true };

      expect(fitStanding(latest, at('2026-07-31'))).toBe('FIT');
      expect(fitStanding(latest, at('2027-01-15'))).toBe('DUE');
    });

    it('reads any NOT_MET on the latest attestation as NOT_FIT, however recent', () => {
      expect(fitStanding({ attestedAt: at('2026-07-30'), allMet: false }, at('2026-07-31'))).toBe(
        'NOT_FIT'
      );
    });
  });
});
