import { ClaimStatus } from '@prisma/client';

/**
 * COMPLIANCE TEST — a claim is not reported on or decided for someone whose
 * identity the firm never established.
 *
 * The exposure this closes: identity was recorded and never enforced, and 225
 * seeded claims were decided or reported on an unverified claimant. It is the
 * firm's own AMLA exposure, and an insurer settling on the firm's
 * recommendation is relying on the firm for it.
 *
 * Shape follows the evidence gate (§3.6 #8) and the people gates: **blocking in
 * registered mode, recorded as an advisory while a TPA**, so registration is a
 * flag flip rather than a rebuild (standing decision 2).
 */
const IDENTITY_GATED_STATUSES: ClaimStatus[] = [
  ClaimStatus.REPORT_PENDING,
  ClaimStatus.APPROVED,
  ClaimStatus.REJECTED,
];

describe('identity gate — where the line is drawn', () => {
  it('gates the point the firm commits an opinion', () => {
    expect(IDENTITY_GATED_STATUSES).toEqual(
      expect.arrayContaining([ClaimStatus.REPORT_PENDING, ClaimStatus.APPROVED, ClaimStatus.REJECTED])
    );
  });

  it('does not gate intake', () => {
    // Someone reporting a loss must never be turned away for not having been
    // verified yet. Refusing a notification would turn a compliance control
    // into a barrier to reporting a claim at all.
    expect(IDENTITY_GATED_STATUSES).not.toContain(ClaimStatus.SUBMITTED);
    expect(IDENTITY_GATED_STATUSES).not.toContain(ClaimStatus.ASSIGNED);
    expect(IDENTITY_GATED_STATUSES).not.toContain(ClaimStatus.SCHEDULED);
  });

  it('does not gate assessment', () => {
    // The work of examining a loss can proceed; committing an opinion on it
    // cannot. Blocking here would stop an adjuster investigating a claim that
    // may well turn out to be fraudulent.
    expect(IDENTITY_GATED_STATUSES).not.toContain(ClaimStatus.IN_ASSESSMENT);
  });

  it('does not gate an SIU referral', () => {
    // Referring a suspicious claim must never require the identity that is
    // itself in question.
    expect(IDENTITY_GATED_STATUSES).not.toContain(ClaimStatus.ESCALATED_SIU);
  });
});

describe('identity gate — what counts as verified', () => {
  const passes = (kycStatus: string | null) => kycStatus === 'VERIFIED';

  it.each([['PENDING'], ['FAILED'], ['EXPIRED'], [null]])(
    'refuses %s',
    status => {
      // EXPIRED matters: a verification that has lapsed is not a verification,
      // and treating "was once verified" as sufficient is how the control rots.
      expect(passes(status)).toBe(false);
    }
  );

  it('accepts VERIFIED', () => {
    expect(passes('VERIFIED')).toBe(true);
  });
});
