import { ClaimStatus } from '@prisma/client';
import {
  OUTCOME_STATUSES,
  TRANSITION_ROLES,
  applicableLimit,
  checkAuthority,
  type AuthorityLimitLike,
} from './claim-authority';

/**
 * COMPLIANCE TESTS — segregation of duties and approval authority.
 *
 * Architecture defect A3: an adjuster could assess a claim and approve it in the
 * same breath, at any amount, with nothing recording that one person did both.
 * Segregation of duties is the first control a financial-services examiner looks
 * for, and its absence is not mitigated by good intent.
 */
describe('Claim authority (A3)', () => {
  const firmAdminLimit = (over: Partial<AuthorityLimitLike> = {}): AuthorityLimitLike => ({
    role: 'FIRM_ADMIN',
    adjusterId: null,
    category: null,
    maxApprovalAmount: 50_000,
    canApproveOwnAssessment: false,
    ...over,
  });

  const request = (over: Partial<Parameters<typeof checkAuthority>[0]> = {}) => ({
    targetStatus: ClaimStatus.APPROVED,
    actorRole: 'FIRM_ADMIN',
    actorAdjusterId: null,
    claimAdjusterId: null,
    claimCategory: null,
    amount: 10_000,
    limits: [firmAdminLimit()],
    ...over,
  });

  describe('who may decide an outcome', () => {
    it('does not let an adjuster approve a claim at all', () => {
      // An outcome is not the assessor's to decide. This is the defect.
      const result = checkAuthority(request({ actorRole: 'ADJUSTER' }));

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/may not move a claim to APPROVED/);
    });

    it('lets an adjuster progress a claim through assessment', () => {
      for (const status of [
        ClaimStatus.SCHEDULED,
        ClaimStatus.IN_ASSESSMENT,
        ClaimStatus.REPORT_PENDING,
      ]) {
        expect(
          checkAuthority(request({ actorRole: 'ADJUSTER', targetStatus: status })).allowed
        ).toBe(true);
      }
    });

    it('lets anyone who sees something escalate it to SIU', () => {
      // Suppressing a suspicion is the failure mode that matters here, so the
      // permitted set is deliberately wide.
      for (const role of ['ADJUSTER', 'FIRM_ADMIN', 'SIU_INVESTIGATOR', 'COMPLIANCE_OFFICER']) {
        expect(
          checkAuthority(request({ actorRole: role, targetStatus: ClaimStatus.ESCALATED_SIU }))
            .allowed
        ).toBe(true);
      }
    });

    it('does not let a support desk or claimant move a claim anywhere', () => {
      for (const role of ['SUPPORT_DESK', 'CLAIMANT']) {
        for (const status of Object.keys(TRANSITION_ROLES) as ClaimStatus[]) {
          expect(checkAuthority(request({ actorRole: role, targetStatus: status })).allowed).toBe(
            false
          );
        }
      }
    });
  });

  describe('segregation of duties', () => {
    it('refuses an approver who assessed the claim themselves', () => {
      const result = checkAuthority(
        request({
          actorRole: 'FIRM_ADMIN',
          actorAdjusterId: 'adj-1',
          claimAdjusterId: 'adj-1',
        })
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/you assessed this claim/i);
    });

    it('allows the same person when the limit expressly permits it', () => {
      // A one-adjuster firm has to be able to operate; what matters is that the
      // exception is configured and recorded, not assumed.
      const result = checkAuthority(
        request({
          actorAdjusterId: 'adj-1',
          claimAdjusterId: 'adj-1',
          limits: [firmAdminLimit({ canApproveOwnAssessment: true })],
        })
      );

      expect(result.allowed).toBe(true);
      expect(result.basis).toMatch(/own assessment expressly permitted/);
    });

    it('allows a different person to decide', () => {
      expect(
        checkAuthority(request({ actorAdjusterId: 'adj-2', claimAdjusterId: 'adj-1' })).allowed
      ).toBe(true);
    });

    it('applies to rejection as well as approval', () => {
      const result = checkAuthority(
        request({
          targetStatus: ClaimStatus.REJECTED,
          actorAdjusterId: 'adj-1',
          claimAdjusterId: 'adj-1',
        })
      );

      // Refusing a claimant's claim is as consequential as paying it.
      expect(result.allowed).toBe(false);
      expect(OUTCOME_STATUSES).toContain(ClaimStatus.REJECTED);
    });
  });

  describe('monetary ceilings', () => {
    it('refuses an amount above the configured limit', () => {
      const result = checkAuthority(request({ amount: 75_000 }));

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/exceeds your approval limit/);
    });

    it('allows an amount exactly at the limit', () => {
      expect(checkAuthority(request({ amount: 50_000 })).allowed).toBe(true);
    });

    it('treats a null ceiling as unlimited', () => {
      expect(
        checkAuthority(
          request({
            actorRole: 'SUPER_ADMIN',
            amount: 10_000_000,
            limits: [firmAdminLimit({ role: 'SUPER_ADMIN', maxApprovalAmount: null })],
          })
        ).allowed
      ).toBe(true);
    });

    it('treats a missing amount as zero rather than as unlimited', () => {
      expect(checkAuthority(request({ amount: null })).allowed).toBe(true);
    });
  });

  describe('when nothing is configured', () => {
    it('refuses rather than assuming unlimited authority', () => {
      // An absent row is far more likely an oversight than a decision to let
      // someone approve without bound, so the safe reading is "no authority".
      const result = checkAuthority(request({ limits: [] }));

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/No approval authority is configured/);
    });

    it('still permits non-outcome transitions with no limits configured', () => {
      expect(
        checkAuthority(
          request({ targetStatus: ClaimStatus.IN_ASSESSMENT, actorRole: 'ADJUSTER', limits: [] })
        ).allowed
      ).toBe(true);
    });
  });

  describe('which limit governs', () => {
    it('prefers a limit naming the individual over one naming their role', () => {
      const limit = applicableLimit({
        actorRole: 'FIRM_ADMIN',
        actorAdjusterId: 'adj-1',
        claimCategory: null,
        limits: [
          firmAdminLimit({ maxApprovalAmount: 50_000 }),
          firmAdminLimit({ role: null, adjusterId: 'adj-1', maxApprovalAmount: 200_000 }),
        ],
      });

      expect(limit?.maxApprovalAmount).toBe(200_000);
    });

    it('prefers a category-specific limit over a general one', () => {
      const limit = applicableLimit({
        actorRole: 'FIRM_ADMIN',
        actorAdjusterId: null,
        claimCategory: 'FIRE',
        limits: [
          firmAdminLimit({ maxApprovalAmount: 50_000 }),
          firmAdminLimit({ category: 'FIRE', maxApprovalAmount: 120_000 }),
        ],
      });

      expect(limit?.maxApprovalAmount).toBe(120_000);
    });

    it('ignores a limit for a different category', () => {
      const limit = applicableLimit({
        actorRole: 'FIRM_ADMIN',
        actorAdjusterId: null,
        claimCategory: 'FLOOD',
        limits: [firmAdminLimit({ category: 'FIRE', maxApprovalAmount: 120_000 })],
      });

      expect(limit).toBeNull();
    });
  });

  describe('the recorded basis', () => {
    it('states the basis on every decision, allowed or refused', () => {
      const cases = [
        request(),
        request({ actorRole: 'ADJUSTER' }),
        request({ amount: 75_000 }),
        request({ limits: [] }),
        request({ actorAdjusterId: 'a', claimAdjusterId: 'a' }),
      ];

      for (const input of cases) {
        expect(checkAuthority(input).basis.trim().length).toBeGreaterThan(10);
      }
    });
  });
});
