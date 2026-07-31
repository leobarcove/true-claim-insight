import {
  ageingBucket,
  computeFeeNote,
  computeProfessionalFee,
  scaleFee,
} from './fee-calculation';

/**
 * COMPLIANCE TESTS — the fee arithmetic behind CSP 11.16–11.18.
 *
 * The number on a fee note gets disputed; these tests hold the arithmetic that
 * has to survive the dispute: progressive bands, SST on the fee alone, and
 * derivations that show the working.
 */
describe('Fee calculation (CSP 11.16–11.18)', () => {
  const bands = [
    { upTo: 10_000, pct: 0.1 },
    { upTo: 50_000, pct: 0.05 },
    { upTo: null, pct: 0.02 },
  ];

  describe('SCALE — progressive bands', () => {
    it('applies each rate only to the slice inside its band', () => {
      // 25,000 = 10,000 @10% + 15,000 @5% = 1,000 + 750.
      expect(scaleFee(bands, 25_000).professionalFee).toBe(1_750);
    });

    it('does not jump at a band edge', () => {
      // A flat-on-total reading would leap from 1,000 to ~500 crossing 10,000.
      const below = scaleFee(bands, 10_000).professionalFee;
      const above = scaleFee(bands, 10_001).professionalFee;

      expect(above - below).toBeLessThan(0.06);
    });

    it('runs the top band unbounded', () => {
      // 100,000 = 1,000 + 2,000 + 50,000 @2% = 4,000.
      expect(scaleFee(bands, 100_000).professionalFee).toBe(4_000);
    });

    it('shows its working', () => {
      const { derivation } = scaleFee(bands, 25_000);

      expect(derivation.join(' ')).toContain('10%');
      expect(derivation.join(' ')).toContain('5%');
    });

    it('refuses a negative amount and an empty scale', () => {
      expect(() => scaleFee(bands, -1)).toThrow(RangeError);
      expect(() => scaleFee([], 1_000)).toThrow(RangeError);
    });
  });

  describe('TIME and FIXED', () => {
    it('computes hourly with the working shown', () => {
      const result = computeProfessionalFee(
        { basis: 'TIME', hourlyRate: 180, sstRate: 0.08 },
        { hours: 6.5 }
      );

      expect(result.professionalFee).toBe(1_170);
      expect(result.derivation[0]).toContain('6.5 h');
    });

    it('refuses a basis whose inputs are missing', () => {
      expect(() =>
        computeProfessionalFee({ basis: 'SCALE', bands, sstRate: 0.08 }, {})
      ).toThrow(/assessed amount/);
      expect(() =>
        computeProfessionalFee({ basis: 'TIME', hourlyRate: 180, sstRate: 0.08 }, {})
      ).toThrow(/hours/);
    });
  });

  describe('the note', () => {
    it('applies SST to the professional fee only, never to disbursements', () => {
      // Disbursements are reimbursements, not the taxable service.
      const note = computeFeeNote(1_000, [250, 130.5], 0.08);

      expect(note.sstAmount).toBe(80);
      expect(note.disbursementsTotal).toBe(380.5);
      expect(note.total).toBe(1_460.5);
    });

    it('rounds to the sen at each named amount', () => {
      const note = computeFeeNote(333.335, [0.005], 0.08);

      expect(note.sstAmount).toBe(26.67);
      expect(Number.isInteger(note.total * 100)).toBe(true);
    });
  });

  describe('ageing', () => {
    const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

    it('buckets by days overdue, with the due date itself still current', () => {
      const due = at('2026-07-01');

      expect(ageingBucket(due, at('2026-07-01'))).toBe('CURRENT');
      expect(ageingBucket(due, at('2026-07-15'))).toBe('OVERDUE_1_30');
      expect(ageingBucket(due, at('2026-08-25'))).toBe('OVERDUE_31_60');
      expect(ageingBucket(due, at('2026-09-20'))).toBe('OVERDUE_61_90');
      expect(ageingBucket(due, at('2026-12-01'))).toBe('OVERDUE_90_PLUS');
    });
  });
});
