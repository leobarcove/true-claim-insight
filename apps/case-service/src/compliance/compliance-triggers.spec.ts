import { coiConflictEvent, slaBreachEvent } from './compliance-triggers';

/**
 * COMPLIANCE TESTS — what reaches the Board register (PD 11.2(d)).
 *
 * Restraint matters as much as coverage: a feed that escalates everything is a
 * feed the Board stops reading, and one that duplicates per observation buries
 * the register it exists to fill.
 */
describe('Compliance event triggers (PD 11.2(d))', () => {
  const clock = (over: Partial<Parameters<typeof slaBreachEvent>[0]> = {}) => ({
    id: 'clock-1',
    stage: 'FINAL_REPORT',
    escalationLevel: 3,
    monitorOnly: false,
    claimNumber: 'CLM-2026-000011',
    ...over,
  });

  describe('SLA breaches', () => {
    it('escalates a firm-side breach at level 3', () => {
      const draft = slaBreachEvent(clock());

      expect(draft?.type).toBe('SLA_BREACH_ESCALATED');
      expect(draft?.severity).toBe('HIGH');
      expect(draft?.title).toContain('CLM-2026-000011');
    });

    it('does not escalate below level 3 — levels 1 and 2 are operations, not Board', () => {
      expect(slaBreachEvent(clock({ escalationLevel: 1 }))).toBeNull();
      expect(slaBreachEvent(clock({ escalationLevel: 2 }))).toBeNull();
    });

    it('never escalates an insurer-side breach to the firm’s own Board', () => {
      // monitorOnly stages measure the insurer's delay. Escalating them here
      // would misstate whose breach it is.
      expect(slaBreachEvent(clock({ monitorOnly: true }))).toBeNull();
    });

    it('keys deduplication to the clock, not the observation', () => {
      // Fifteen-minute sweeps observe the same breach repeatedly; one fact,
      // one event.
      expect(slaBreachEvent(clock())?.dedupeKey).toBe('sla-breach:clock-1');
      expect(slaBreachEvent(clock({ escalationLevel: 5 }))?.dedupeKey).toBe('sla-breach:clock-1');
    });

    it('cites the governing requirements in the details', () => {
      const draft = slaBreachEvent(clock());
      expect(draft?.details).toMatch(/12\.5/);
      expect(draft?.details).toMatch(/11\.2\(d\)/);
    });
  });

  describe('COI attestations with a conflict', () => {
    it('is always Board-visible, at HIGH', () => {
      const draft = coiConflictEvent({ claimId: 'c1', adjusterId: 'a1', note: 'spouse at insurer' });

      expect(draft.severity).toBe('HIGH');
      expect(draft.details).toContain('spouse at insurer');
    });

    it('dedupes per claim and adjuster, so re-attesting does not multiply events', () => {
      expect(coiConflictEvent({ claimId: 'c1', adjusterId: 'a1', note: null }).dedupeKey).toBe(
        'coi-attest:c1:a1'
      );
    });
  });
});
