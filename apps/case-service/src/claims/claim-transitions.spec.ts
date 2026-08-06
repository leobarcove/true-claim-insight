import { ClaimStatus } from '@prisma/client';
import { CLAIM_DECIDABLE_STATUSES, canDecideClaim } from '@tci/shared-types';

import { CLAIM_STATUS_TRANSITIONS, CLAIM_UNREACHABLE_STATUSES } from './claim-transitions';

/**
 * Holds the portal's copy of the decision rule to the server's state machine.
 *
 * `CLAIM_STATUS_TRANSITIONS` is the authority; `CLAIM_DECIDABLE_STATUSES` in
 * @tci/shared-types exists only so the portal can enable a button without
 * guessing. Duplication is acceptable here — importing case-service into a
 * React app is not — but only while something proves the two agree.
 *
 * The defect that prompted this: Approve and Reject were enabled on a CLOSED
 * claim, an action the server refuses, because the portal tested
 * `status !== APPROVED && status !== REJECTED` in four separate places.
 */
describe('claim decision rule — portal against the state machine', () => {
  const every = Object.keys(CLAIM_STATUS_TRANSITIONS) as ClaimStatus[];

  it.each(every)('agrees on %s', status => {
    const serverAllows = CLAIM_STATUS_TRANSITIONS[status].includes(ClaimStatus.APPROVED);
    expect(canDecideClaim(status)).toBe(serverAllows);
  });

  it('agrees on rejection wherever it agrees on approval', () => {
    // The two travel together in every row; if they ever diverge, one flag
    // cannot express both and this test is the place that says so.
    for (const status of every) {
      const next = CLAIM_STATUS_TRANSITIONS[status];
      expect(next.includes(ClaimStatus.APPROVED)).toBe(next.includes(ClaimStatus.REJECTED));
    }
  });

  it('excludes CLOSED', () => {
    // Reopening runs through the supplementary endpoint so the CSP
    // five-working-day clock starts. Deciding straight from CLOSED skips it.
    expect(canDecideClaim(ClaimStatus.CLOSED)).toBe(false);
  });

  it('lists no status the machine cannot reach', () => {
    for (const status of CLAIM_DECIDABLE_STATUSES) {
      expect(CLAIM_UNREACHABLE_STATUSES).not.toContain(status);
    }
  });
});
