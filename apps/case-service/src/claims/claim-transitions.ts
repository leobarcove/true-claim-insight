/**
 * Permitted claim status transitions.
 *
 * Extracted from ClaimsService so it can be reasoned about as a graph rather
 * than read inside a validation method. The SLA suite walks it to prove that no
 * reachable path through the claim lifecycle can strand a running deadline —
 * a check that is impossible while the table is a local variable.
 *
 * Note the statuses that appear in the ClaimStatus enum but in no transition
 * list: `DOCUMENTS_PENDING`, `PENDING_ASSIGNMENT` and `UNDER_REVIEW` are
 * currently unreachable. That is a Phase 1 lifecycle gap, not an omission here
 * — see SLA_TRANSITIONS for what it costs.
 */
export const CLAIM_STATUS_TRANSITIONS: Record<string, string[]> = {
  SUBMITTED: ['ASSIGNED', 'CLOSED', 'APPROVED', 'REJECTED'],
  ASSIGNED: ['SCHEDULED', 'CLOSED', 'APPROVED', 'REJECTED'],
  SCHEDULED: ['IN_ASSESSMENT', 'CANCELLED', 'CLOSED', 'APPROVED', 'REJECTED'],
  IN_ASSESSMENT: ['REPORT_PENDING', 'ESCALATED_SIU', 'CLOSED', 'APPROVED', 'REJECTED'],
  REPORT_PENDING: ['APPROVED', 'REJECTED', 'ESCALATED_SIU'],
  APPROVED: ['CLOSED'],
  REJECTED: ['CLOSED'],
  ESCALATED_SIU: ['APPROVED', 'REJECTED', 'CLOSED'],
  CANCELLED: ['CLOSED'],
};

/** The status every claim starts in. */
export const CLAIM_INITIAL_STATUS = 'SUBMITTED';

/** Statuses from which no further transition is possible. */
export const CLAIM_TERMINAL_STATUSES = Object.entries(CLAIM_STATUS_TRANSITIONS)
  .filter(([, next]) => next.length === 0)
  .map(([status]) => status)
  .concat('CLOSED');
