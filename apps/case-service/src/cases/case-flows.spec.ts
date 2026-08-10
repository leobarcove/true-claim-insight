import {
  CASE_FLOWS,
  computeCompleteness,
  computeDeadlineFlags,
  getFlow,
  resolveNextStep,
  validateAnswer,
  CLAIM_WINDOW_DAYS,
  NOTIFY_WITHIN_HOURS,
} from '@tci/shared-types';
import { DocumentType, TravelClaimType } from '@prisma/client';

/**
 * COMPLIANCE TESTS — intake flow rules shared by every channel.
 *
 * The same helpers drive the claimant chat, the staff capture form and
 * server-side validation, so a regression here changes behaviour in all three
 * at once. Specifically guarded:
 *
 *  - CSP notification deadlines (24 hours / 30 days) surface as warnings and
 *    never as blockers — rejection stays a human decision (MASTER_PLAN §3.2).
 *  - Evidence completeness is computed from mandatory requirements only.
 *  - Every travel claim type has a flow whose steps are reachable.
 */
describe('travel intake flows (compliance)', () => {
  const at = (iso: string) => new Date(iso);

  describe('CSP deadline flags', () => {
    const now = at('2026-07-30T12:00:00Z');

    it('flags nothing when reported promptly', () => {
      const f = computeDeadlineFlags(at('2026-07-30T06:00:00Z'), now);

      expect(f.notifiedLate).toBe(false);
      expect(f.outOfWindow).toBe(false);
      expect(f.warnings).toHaveLength(0);
    });

    it(`flags late notification beyond ${NOTIFY_WITHIN_HOURS} hours`, () => {
      const f = computeDeadlineFlags(at('2026-07-28T06:00:00Z'), now);

      expect(f.notifiedLate).toBe(true);
      expect(f.outOfWindow).toBe(false);
      expect(f.warnings).toHaveLength(1);
    });

    it(`flags out-of-window beyond ${CLAIM_WINDOW_DAYS} days`, () => {
      const f = computeDeadlineFlags(at('2026-05-01T06:00:00Z'), now);

      expect(f.outOfWindow).toBe(true);
      expect(f.warnings[0]).toContain(String(CLAIM_WINDOW_DAYS));
    });

    it('produces warnings only — never a hard failure signal', () => {
      // Deliberate: BNM/market practice is that a late claim is still recorded;
      // declining it is the insurer's decision, not the platform's.
      const f = computeDeadlineFlags(at('2020-01-01T00:00:00Z'), now);

      expect(f).not.toHaveProperty('blocked');
      expect(f).not.toHaveProperty('rejected');
      expect(f.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('evidence completeness', () => {
    const reqs = [
      { documentType: DocumentType.AIRLINE_DELAY_CONFIRMATION, isMandatory: true },
      { documentType: DocumentType.BOARDING_PASS, isMandatory: true },
      { documentType: DocumentType.PROOF_OF_OWNERSHIP, isMandatory: false },
    ];

    it('scores only mandatory requirements', () => {
      const c = computeCompleteness([DocumentType.AIRLINE_DELAY_CONFIRMATION], reqs);

      expect(c.mandatoryTotal).toBe(2);
      expect(c.mandatoryUploaded).toBe(1);
      expect(c.percent).toBe(50);
      expect(c.missingMandatory).toEqual([DocumentType.BOARDING_PASS]);
    });

    it('is not complete when only optional evidence is supplied', () => {
      const c = computeCompleteness([DocumentType.PROOF_OF_OWNERSHIP], reqs);

      expect(c.percent).toBe(0);
      expect(c.missingMandatory).toHaveLength(2);
    });

    it('reaches 100% on all mandatory evidence regardless of optional', () => {
      const c = computeCompleteness(
        [DocumentType.AIRLINE_DELAY_CONFIRMATION, DocumentType.BOARDING_PASS],
        reqs
      );

      expect(c.percent).toBe(100);
      expect(c.missingMandatory).toHaveLength(0);
    });
  });

  describe('flow integrity', () => {
    it('defines a flow for all five in-scope travel claim types', () => {
      expect(Object.keys(CASE_FLOWS).sort()).toEqual(
        [
          TravelClaimType.FLIGHT_DELAY,
          TravelClaimType.LUGGAGE_DAMAGE,
          TravelClaimType.LUGGAGE_LOSS,
          TravelClaimType.MEDICAL,
          TravelClaimType.TRIP_CANCELLATION,
        ].sort()
      );
    });

    it.each(Object.values(TravelClaimType))('%s flow terminates and asks for payout details', type => {
      const flow = getFlow(type);
      const ids = flow.steps.map(s => s.id);

      // Bank details are required for payout on every flow.
      expect(ids).toContain('bank-account-number');
      expect(ids).toContain('review');

      // Walking from the entry step must terminate rather than loop.
      const answers: Record<string, string> = {};
      let step: string | null = flow.entryStepId;
      let hops = 0;
      while (step && hops < 100) {
        answers[step] = 'x';
        step = resolveNextStep(flow, step, answers);
        hops += 1;
      }
      expect(hops).toBeLessThan(100);
    });
  });

  describe('answer validation', () => {
    const flow = getFlow(TravelClaimType.FLIGHT_DELAY);
    const step = (id: string) => flow.steps.find(s => s.id === id)!;

    it('accepts alphanumeric airline designators such as AirAsia X "D7 522"', () => {
      // Regression guard: an earlier pattern rejected carriers whose IATA code
      // contains a digit, blocking legitimate Malaysian claims.
      expect(validateAnswer(step('flight-number'), 'D7 522').valid).toBe(true);
      expect(validateAnswer(step('flight-number'), 'MH370').valid).toBe(true);
    });

    it('rejects an empty mandatory answer', () => {
      expect(validateAnswer(step('destination'), '').valid).toBe(false);
    });

    it('allows "skip" only on optional steps', () => {
      expect(validateAnswer(step('policy-number'), 'skip').valid).toBe(true);
      expect(validateAnswer(step('destination'), 'skip').valid).toBe(true); // free text
      expect(validateAnswer(step('trip-start'), 'skip').valid).toBe(false); // date
    });
  });
});
