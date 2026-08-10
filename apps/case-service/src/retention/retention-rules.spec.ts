import { readFileSync } from 'fs';
import { join } from 'path';
import {
  RETENTION_FLOOR_YEARS,
  assertRetentionYears,
  canPurge,
  purgeEligibleFrom,
} from './retention-rules';

/**
 * COMPLIANCE TESTS — BNM Adjuster PD 12.8 retention.
 *
 * Records must be kept at least seven years. The rules here decide whether
 * destroying a record is permissible *right now*; a wrong "yes" destroys
 * regulatory evidence, so every ambiguous case must answer "no".
 */
describe('Retention rules (PD 12.8)', () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

  const question = (over: Partial<Parameters<typeof canPurge>[0]> = {}) => ({
    claimClosedAt: at('2026-06-30'),
    legalHoldAt: null,
    retainYears: 7,
    now: at('2033-07-01'),
    ...over,
  });

  describe('the seven-year floor', () => {
    it('is seven years', () => {
      expect(RETENTION_FLOOR_YEARS).toBe(7);
    });

    it('refuses a policy shorter than the floor', () => {
      for (const years of [0, 3, 6]) {
        expect(() => assertRetentionYears(years)).toThrow(/PD 12\.8/);
      }
    });

    it('accepts the floor and anything longer', () => {
      expect(() => assertRetentionYears(7)).not.toThrow();
      expect(() => assertRetentionYears(10)).not.toThrow();
    });

    it('applies the floor even when the policy value is lower', () => {
      // Belt and braces with the DB check constraint: if a sub-floor value ever
      // reaches the arithmetic, the floor still governs the date.
      const eligible = purgeEligibleFrom(at('2026-06-30'), 3);
      expect(eligible?.toISOString().slice(0, 10)).toBe('2033-06-30');
    });
  });

  describe('when purging is permissible', () => {
    it('allows a purge once the retention period has fully run', () => {
      const decision = canPurge(question());
      expect(decision.allowed).toBe(true);
      expect(decision.basis).toMatch(/retention period ended/);
    });

    it('refuses the day before the period ends', () => {
      expect(canPurge(question({ now: at('2033-06-29') })).allowed).toBe(false);
    });

    it('refuses while the claim is still open — retention has not begun', () => {
      // Seven years from *closure*, not from creation: an open claim's records
      // are working records, not archive.
      const decision = canPurge(question({ claimClosedAt: null }));
      expect(decision.allowed).toBe(false);
      expect(decision.basis).toMatch(/not closed/);
    });

    it('refuses under a legal hold however old the claim is', () => {
      const decision = canPurge(
        question({ legalHoldAt: at('2030-01-01'), now: at('2050-01-01') })
      );
      expect(decision.allowed).toBe(false);
      expect(decision.basis).toMatch(/legal hold/);
    });

    it('checks the hold before the arithmetic', () => {
      // A hold on an open claim must report the hold, not the open claim — the
      // hold is the stronger and more newsworthy reason.
      const decision = canPurge(question({ claimClosedAt: null, legalHoldAt: at('2030-01-01') }));
      expect(decision.basis).toMatch(/legal hold/);
    });

    it('states a basis on every decision, so the purge audit row can carry it', () => {
      for (const q of [
        question(),
        question({ now: at('2027-01-01') }),
        question({ claimClosedAt: null }),
        question({ legalHoldAt: at('2030-01-01') }),
      ]) {
        expect(canPurge(q).basis.trim().length).toBeGreaterThan(15);
      }
    });
  });

  describe('the hard-delete ban', () => {
    const read = (relative: string) =>
      readFileSync(join(__dirname, relative), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*/g, '');

    it('keeps document destruction out of the documents service', () => {
      // "Delete" in the UI is a soft delete. If prisma.document.delete
      // reappears in documents.service.ts, a user-triggered path can destroy
      // evidence again — the exact finding this work closed.
      expect(read('../documents/documents.service.ts')).not.toMatch(
        /prisma\.document\.delete\b/
      );
    });

    it('confines document destruction to the retention service', () => {
      // The purge path must exist — a retention policy that can never delete is
      // not a retention policy — but only here, behind canPurge.
      expect(read('./retention.service.ts')).toMatch(/prisma\.document\.delete\b/);
      expect(read('./retention.service.ts')).toMatch(/canPurge/);
    });
  });
});
