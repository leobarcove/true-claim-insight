/**
 * Which facts raise a compliance event, and at what severity — pure decisions.
 *
 * PD 11.2(d) wants issues escalated to the Board; the judgment encoded here is
 * *which* facts qualify. The register's worth depends on restraint as much as
 * coverage: a feed that escalates everything is a feed the Board stops reading.
 */

export interface SlaClockFact {
  id: string;
  stage: string;
  escalationLevel: number;
  monitorOnly: boolean;
  claimNumber: string | null;
}

export interface ComplianceEventDraft {
  type: 'SLA_BREACH_ESCALATED' | 'COI_CONFLICT_ATTESTED';
  severity: 'MEDIUM' | 'HIGH';
  title: string;
  details: string;
  dedupeKey: string;
}

/**
 * An SLA breach becomes Board business only at escalation level 3 — the coarse
 * step deliberately reserved for it — and only when the obligation is the
 * firm's. Insurer-side (`monitorOnly`) delays are management information, not
 * the firm's compliance failures, and escalating them to the firm's own Board
 * would misstate whose breach it is.
 */
export function slaBreachEvent(clock: SlaClockFact): ComplianceEventDraft | null {
  if (clock.monitorOnly) return null;
  if (clock.escalationLevel < 3) return null;

  return {
    type: 'SLA_BREACH_ESCALATED',
    severity: 'HIGH',
    title: `${clock.stage} breach at escalation level ${clock.escalationLevel}` +
      (clock.claimNumber ? ` on ${clock.claimNumber}` : ''),
    details:
      'A firm-side turnaround obligation has been in breach for at least five working days ' +
      '(PD 12.5 / CSP). Escalated per PD 11.2(d).',
    // Keyed to the clock, not the sweep: however many sweeps observe this
    // breach, it is one fact and one event.
    dedupeKey: `sla-breach:${clock.id}`,
  };
}

/** An adjuster attesting a conflict on their own claim is always Board-visible. */
export function coiConflictEvent(fact: {
  claimId: string;
  adjusterId: string;
  note: string | null;
}): ComplianceEventDraft {
  return {
    type: 'COI_CONFLICT_ATTESTED',
    severity: 'HIGH',
    title: 'Adjuster attested a conflict of interest on an assigned claim',
    details:
      `Claim ${fact.claimId}: the assigned adjuster declared a conflict in their per-claim ` +
      `attestation (PD 12.1(d)). ${fact.note ?? ''}`.trim(),
    dedupeKey: `coi-attest:${fact.claimId}:${fact.adjusterId}`,
  };
}
