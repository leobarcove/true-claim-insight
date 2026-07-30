import { ClaimStatus } from '@prisma/client';

/**
 * Who may move a claim to which status, and on what authority.
 *
 * Pure decisions, no database, so the segregation-of-duties control can be
 * tested exhaustively in CI. This is architecture defect A3: an adjuster could
 * assess a claim and approve it in the same breath, at any amount, and nothing
 * recorded that one person did both.
 */

/**
 * Roles permitted to make each transition.
 *
 * The shape of the list matters more than any single entry: **an outcome is not
 * the assessor's to decide.** ADJUSTER moves a claim through assessment and
 * hands it on; APPROVED and REJECTED require a role that did not do the
 * assessment work. In the TPA model the insurer decides in any case, and the
 * firm records that decision — which is why the roles that may record it are
 * the administrative ones.
 */
export const TRANSITION_ROLES: Partial<Record<ClaimStatus, string[]>> = {
  [ClaimStatus.ASSIGNED]: ['FIRM_ADMIN', 'SUPER_ADMIN'],
  [ClaimStatus.SCHEDULED]: ['ADJUSTER', 'FIRM_ADMIN', 'SUPER_ADMIN'],
  [ClaimStatus.IN_ASSESSMENT]: ['ADJUSTER', 'FIRM_ADMIN', 'SUPER_ADMIN'],
  [ClaimStatus.REPORT_PENDING]: ['ADJUSTER', 'FIRM_ADMIN', 'SUPER_ADMIN'],
  [ClaimStatus.UNDER_REVIEW]: ['ADJUSTER', 'FIRM_ADMIN', 'SUPER_ADMIN'],
  // Fraud referral is deliberately wide: anyone who sees something must be able
  // to escalate it. Suppressing a suspicion is the failure mode that matters.
  [ClaimStatus.ESCALATED_SIU]: [
    'ADJUSTER',
    'FIRM_ADMIN',
    'SUPER_ADMIN',
    'SIU_INVESTIGATOR',
    'COMPLIANCE_OFFICER',
  ],
  [ClaimStatus.APPROVED]: ['FIRM_ADMIN', 'SUPER_ADMIN'],
  [ClaimStatus.REJECTED]: ['FIRM_ADMIN', 'SUPER_ADMIN', 'SIU_INVESTIGATOR'],
  [ClaimStatus.CLOSED]: ['FIRM_ADMIN', 'SUPER_ADMIN'],
};

/** Transitions that decide the claim's outcome, and so require authority. */
export const OUTCOME_STATUSES: ClaimStatus[] = [ClaimStatus.APPROVED, ClaimStatus.REJECTED];

export interface AuthorityLimitLike {
  role?: string | null;
  adjusterId?: string | null;
  category?: string | null;
  maxApprovalAmount?: number | null;
  canApproveOwnAssessment: boolean;
}

export interface AuthorityRequest {
  targetStatus: ClaimStatus;
  actorRole: string;
  /** Adjuster profile of the person acting, when they have one. */
  actorAdjusterId?: string | null;
  /** Adjuster the claim is assigned to. */
  claimAdjusterId?: string | null;
  claimCategory?: string | null;
  /** Value being approved — the approved amount, or the estimate if not yet set. */
  amount?: number | null;
  /** Limits configured for this tenant, already filtered to active ones. */
  limits: AuthorityLimitLike[];
}

export interface AuthorityDecision {
  allowed: boolean;
  reason?: string;
  /** Recorded on the audit row so the basis of an approval is never assumed. */
  basis: string;
}

/**
 * Pick the limit that governs this actor.
 *
 * A limit naming the individual beats one naming their role, and a limit for a
 * specific claim category beats a general one — so a firm can widen or narrow
 * one person's authority without rewriting everyone's.
 */
export function applicableLimit(
  request: Pick<AuthorityRequest, 'actorRole' | 'actorAdjusterId' | 'claimCategory' | 'limits'>
): AuthorityLimitLike | null {
  const candidates = request.limits.filter(limit => {
    const matchesHolder = limit.adjusterId
      ? limit.adjusterId === request.actorAdjusterId
      : limit.role === request.actorRole;
    const matchesCategory = !limit.category || limit.category === request.claimCategory;
    return matchesHolder && matchesCategory;
  });

  const score = (limit: AuthorityLimitLike) => (limit.adjusterId ? 2 : 0) + (limit.category ? 1 : 0);
  return candidates.sort((a, b) => score(b) - score(a))[0] ?? null;
}

/**
 * May this actor make this transition?
 *
 * Three gates in order: the role may make the transition at all; the actor is
 * not deciding the outcome of their own assessment; and the value is within
 * their configured ceiling.
 */
export function checkAuthority(request: AuthorityRequest): AuthorityDecision {
  const { targetStatus, actorRole, actorAdjusterId, claimAdjusterId, amount } = request;

  const permitted = TRANSITION_ROLES[targetStatus];
  if (permitted && !permitted.includes(actorRole)) {
    return {
      allowed: false,
      basis: `${actorRole} is not permitted to move a claim to ${targetStatus}`,
      reason:
        `${actorRole} may not move a claim to ${targetStatus}. ` +
        `Permitted: ${permitted.join(', ')}.`,
    };
  }

  if (!OUTCOME_STATUSES.includes(targetStatus)) {
    return { allowed: true, basis: `${actorRole} permitted to set ${targetStatus}` };
  }

  const limit = applicableLimit(request);

  // No configured limit means no authority, not unlimited authority. An absent
  // row is far more likely to be an oversight than a decision to let someone
  // approve without bound.
  if (!limit) {
    return {
      allowed: false,
      basis: `no authority limit configured for ${actorRole}`,
      reason:
        `No approval authority is configured for ${actorRole}. ` +
        'An authority limit must be granted before this claim can be decided.',
    };
  }

  // Segregation of duties (§4.3 A3).
  const isOwnAssessment =
    Boolean(actorAdjusterId) && Boolean(claimAdjusterId) && actorAdjusterId === claimAdjusterId;
  if (isOwnAssessment && !limit.canApproveOwnAssessment) {
    return {
      allowed: false,
      basis: 'actor assessed this claim; segregation of duties applies',
      reason:
        'You assessed this claim, so you may not also decide its outcome. ' +
        'Another authorised person must record the decision.',
    };
  }

  if (limit.maxApprovalAmount !== null && limit.maxApprovalAmount !== undefined) {
    const value = amount ?? 0;
    if (value > limit.maxApprovalAmount) {
      return {
        allowed: false,
        basis: `amount ${value} exceeds limit ${limit.maxApprovalAmount}`,
        reason:
          `This claim's value of ${value} exceeds your approval limit of ` +
          `${limit.maxApprovalAmount}. It must be decided by someone with higher authority.`,
      };
    }
  }

  const ceiling =
    limit.maxApprovalAmount === null || limit.maxApprovalAmount === undefined
      ? 'no ceiling'
      : `ceiling ${limit.maxApprovalAmount}`;

  return {
    allowed: true,
    basis:
      `${actorRole} authorised for ${targetStatus} (${ceiling}` +
      (isOwnAssessment ? ', own assessment expressly permitted' : '') +
      ')',
  };
}
