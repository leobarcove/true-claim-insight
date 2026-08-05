import { ClaimStatus } from '@prisma/client';

/**
 * Permitted claim status transitions.
 *
 * Extracted from ClaimsService so it can be reasoned about as a graph rather
 * than read inside a validation method. The SLA suite walks it to prove that no
 * reachable path through the claim lifecycle can strand a running deadline —
 * a check that is impossible while the table is a local variable.
 *
 * Typed `Record<ClaimStatus, ClaimStatus[]>`, not `Record<string, string[]>`.
 * The loose typing hid two defects that only became visible when the flow
 * diagrams were transcribed from this file:
 *
 *  - `CANCELLED` was listed as a target of SCHEDULED and as a key of its own,
 *    but no such member exists in the ClaimStatus enum. The guard would have
 *    permitted the transition and Postgres would then have rejected the write,
 *    so the failure surfaced at the database rather than at the boundary. It
 *    was never reachable in practice — nothing wrote it — so removing the
 *    edges changes no behaviour. Cancelling a claim is already expressible:
 *    every pre-assessment status can go straight to CLOSED.
 *  - Three enum members had no entry at all, and the lookup falls back to `[]`,
 *    which silently means "no exit from here" rather than "not configured".
 *
 * An exhaustive key type makes both a compile error instead of a runtime one.
 */
export const CLAIM_STATUS_TRANSITIONS: Record<ClaimStatus, ClaimStatus[]> = {
  SUBMITTED: ['ASSIGNED', 'CLOSED', 'APPROVED', 'REJECTED'],
  ASSIGNED: ['SCHEDULED', 'CLOSED', 'APPROVED', 'REJECTED'],
  SCHEDULED: ['IN_ASSESSMENT', 'CLOSED', 'APPROVED', 'REJECTED'],
  IN_ASSESSMENT: ['REPORT_PENDING', 'ESCALATED_SIU', 'CLOSED', 'APPROVED', 'REJECTED'],
  REPORT_PENDING: ['APPROVED', 'REJECTED', 'ESCALATED_SIU'],
  APPROVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  ESCALATED_SIU: ['APPROVED', 'REJECTED', 'CLOSED'],
  // Supplementary claims (CSP: respond within 5 working days). Reopening is a
  // deliberate act through the supplementary endpoint — which starts the
  // 5-working-day clock — not an ordinary status change; the edge exists so the
  // state machine tells the truth about what the endpoint does.
  CLOSED: ['IN_ASSESSMENT'],

  // ---------------------------------------------------------------------
  // Declared, but with no route in and no route out. See
  // CLAIM_UNREACHABLE_STATUSES below: these are a recorded Phase 1 lifecycle
  // gap, not terminal states. Listing them explicitly is what the exhaustive
  // type buys — the gap is now a visible declaration rather than a lookup
  // that happens to return nothing.
  // ---------------------------------------------------------------------
  DOCUMENTS_PENDING: [],
  PENDING_ASSIGNMENT: [],
  UNDER_REVIEW: [],
};

/**
 * Statuses the enum defines but the machine cannot reach.
 *
 * Recorded rather than tolerated. `sla-lifecycle.spec.ts` walks the graph from
 * the initial status and asserts which SLA-bearing statuses are unreachable, so
 * making one reachable without wiring its clocks fails there. Kept separate
 * from the terminal statuses because "nothing leads here" and "nothing leaves
 * here" are different facts, and only the second one ends a claim.
 */
export const CLAIM_UNREACHABLE_STATUSES: ClaimStatus[] = [
  'DOCUMENTS_PENDING',
  'PENDING_ASSIGNMENT',
  'UNDER_REVIEW',
];

/** The status every claim starts in. */
export const CLAIM_INITIAL_STATUS: ClaimStatus = 'SUBMITTED';

/**
 * Reachable statuses from which no further transition is possible.
 *
 * Excludes the unreachable set: a status nothing can arrive at has not "ended"
 * a claim, and counting it as terminal would overstate how many ways a claim
 * can finish.
 */
export const CLAIM_TERMINAL_STATUSES: ClaimStatus[] = (
  Object.entries(CLAIM_STATUS_TRANSITIONS) as [ClaimStatus, ClaimStatus[]][]
)
  .filter(([status, next]) => next.length === 0 && !CLAIM_UNREACHABLE_STATUSES.includes(status))
  .map(([status]) => status)
  .concat('CLOSED');
