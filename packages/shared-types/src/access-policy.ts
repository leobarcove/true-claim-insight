/**
 * Access policy — who may hold which role, and where.
 *
 * One place for the rules every service enforces, so the gateway, case-service
 * and the portals cannot drift apart on them. The rules are deliberately few:
 * the per-route permission lists stay on each controller as `@Roles(...)`, and
 * this module answers the questions those lists cannot — *in which kind of
 * organisation* a role may exist, and *which organisation* may author the
 * adjuster's work.
 *
 * Grounding, so each rule can be traced to what requires it:
 *
 * - FSA 2013 s.133 + Sch 11 item 17 — an insurer may disclose customer
 *   information to an adjuster it engages; the adjuster may not pass it on.
 *   Tenant isolation is that duty expressed in software.
 * - BNM Adjuster PD (BNM/RH/PD 032-29) 1.1 and 12.1(c) — adjusting work is
 *   done "independently and objectively". An insurer's staff may read the
 *   adjuster's work; they may not write it.
 * - BNM Adjuster PD 10, 11, 13 — fit and proper, Board escalation and
 *   notifications are duties of the *registered adjuster*. They belong to the
 *   adjusting firm's own people, never to a panel insurer's.
 * - BNM MCIPD (31 Oct 2025) 10.25 — every job's role profile describes its
 *   access to customer information, on a need-to-know basis. `ROLE_PROFILES`
 *   is that description.
 * - FSA 2013 s.17(2)(c) — an insurer's own employee may assist in adjusting a
 *   claim without registering. That is why insurer-side reviewer roles exist
 *   at all.
 *
 * Shariah governance is IFSA 2013 territory and binds takaful operators, not
 * adjusters: `SHARIAH_REVIEWER` exists only inside an insurer tenant, and only
 * reads.
 *
 * ESM note: index.ts re-exports this module, so the enums are imported as
 * types only and the rules use string literals (see case-flows.ts).
 */
import type { TenantType, UserRole } from './index';

/** A role, accepting either the TS enum member or Prisma's string literal. */
export type RoleName = `${UserRole}`;

/** A tenant type, accepting either the TS enum member or Prisma's string literal. */
export type TenantTypeName = `${TenantType}`;

/**
 * The platform operator's role. Held on the user, not through a membership:
 * it is the one role that exists outside every tenant.
 */
export const PLATFORM_ROLE: RoleName = 'SUPER_ADMIN';

/**
 * Claimants sign in with a one-time code against the Claimant table and never
 * hold a membership. Their JWT carries this role; nothing else may.
 */
export const CLAIMANT_ROLE: RoleName = 'CLAIMANT';

/**
 * Roles a membership may carry, by the kind of organisation.
 *
 * An `ADJUSTER` exists only in an adjusting firm — an insurer employee doing
 * adjusting work is exempt under FSA s.17(2)(c) but is not a registered
 * adjuster's "adjusting employee" (PD 5.2), so the platform does not model
 * them as one. `SIU_INVESTIGATOR` and `SHARIAH_REVIEWER` are insurer
 * functions. `COMPLIANCE_OFFICER`, `FIRM_ADMIN` and `SUPPORT_DESK` exist on
 * both sides; because roles are read from the membership for the *active*
 * tenant, an insurer's compliance officer is simply nobody inside the firm.
 */
export const TENANT_ROLES: Readonly<Record<TenantTypeName, readonly RoleName[]>> = {
  ADJUSTING_FIRM: ['ADJUSTER', 'FIRM_ADMIN', 'COMPLIANCE_OFFICER', 'SUPPORT_DESK'],
  INSURER: [
    'FIRM_ADMIN',
    'SIU_INVESTIGATOR',
    'COMPLIANCE_OFFICER',
    'SUPPORT_DESK',
    'SHARIAH_REVIEWER',
  ],
};

/** May a membership in a tenant of this type carry this role? */
export function isRoleAllowedInTenant(
  role: string | null | undefined,
  tenantType: string | null | undefined
): boolean {
  if (!role || !tenantType) return false;
  const allowed = TENANT_ROLES[tenantType as TenantTypeName];
  return !!allowed && allowed.includes(role as RoleName);
}

/**
 * May staff of this tenant write the adjuster's work product — findings,
 * quantum, assessment decisions, reports, quality reviews? Only the adjusting
 * firm (PD 1.1, 12.1(c)). The insurer reads it; the platform operator acting
 * inside a tenant inherits that tenant's answer.
 */
export function mayAuthorAdjusterWork(tenantType: string | null | undefined): boolean {
  return tenantType === 'ADJUSTING_FIRM';
}

/**
 * Do the registered adjuster's own governance duties (PD 10, 11, 13 — fit and
 * proper, Board escalation, notifications to BNM) belong to this tenant? Only
 * to the adjusting firm.
 */
export function holdsAdjusterDuties(tenantType: string | null | undefined): boolean {
  return tenantType === 'ADJUSTING_FIRM';
}

/**
 * Is the actor acting on themselves? Separation of duties refuses these:
 * recognising your own seniority, verifying your own licence, resolving a
 * conflict you declared or that concerns you, approving wording you drafted.
 * Unknown subjects (null/undefined) never match — absence is not identity.
 */
export function isSelfAction(
  actorUserId: string | null | undefined,
  subjectUserIds: ReadonlyArray<string | null | undefined>
): boolean {
  if (!actorUserId) return false;
  return subjectUserIds.some(subject => !!subject && subject === actorUserId);
}

/**
 * How much customer information a role reaches (MCIPD 10.25). Ordered from
 * least to most.
 */
export type CustomerInformationAccess =
  | 'OWN_RECORD'
  | 'REDACTED'
  | 'CASE_SCOPED'
  | 'FULL_WITHIN_TENANT'
  | 'PLATFORM';

export interface RoleProfile {
  /** What the job is, in a sentence an examiner can read. */
  purpose: string;
  /** Where the role may exist. `PLATFORM` and `CLAIMANT` sit outside tenants. */
  heldIn: ReadonlyArray<TenantTypeName | 'PLATFORM' | 'CLAIMANT'>;
  customerInformation: CustomerInformationAccess;
  /** The need-to-know, stated. */
  needToKnow: string;
}

/**
 * The role profiles MCIPD 10.25 asks for: each job's purpose and its access to
 * customer information. Rendered for examiners and read by tests; the
 * controllers' `@Roles` lists are the enforcement.
 */
export const ROLE_PROFILES: Readonly<Record<RoleName, RoleProfile>> = {
  SUPER_ADMIN: {
    purpose: 'Platform operator: provisions tenants and memberships, runs platform jobs.',
    heldIn: ['PLATFORM'],
    customerInformation: 'PLATFORM',
    needToKnow:
      "Provisioning and incident response. Inside a tenant it acts as that tenant's firm administrator and is audited as itself.",
  },
  ADJUSTER: {
    purpose: 'Adjusting employee (PD 5.2): investigates cause and quantum, authors reports.',
    heldIn: ['ADJUSTING_FIRM'],
    customerInformation: 'CASE_SCOPED',
    needToKnow: 'The claims assigned to the firm, to investigate and assess them.',
  },
  FIRM_ADMIN: {
    purpose:
      'Senior management of the tenant: users, assignments, authority limits; in an adjusting firm, the PD 11.2 controls.',
    heldIn: ['ADJUSTING_FIRM', 'INSURER'],
    customerInformation: 'FULL_WITHIN_TENANT',
    needToKnow: "Oversight of the tenant's own book, including audited reveals of payout details.",
  },
  COMPLIANCE_OFFICER: {
    purpose:
      'Compliance function of the tenant it belongs to: registers, examinations, s.143 production.',
    heldIn: ['ADJUSTING_FIRM', 'INSURER'],
    customerInformation: 'FULL_WITHIN_TENANT',
    needToKnow: "Producing the tenant's records to BNM and monitoring its controls.",
  },
  SUPPORT_DESK: {
    purpose: 'Handles claimant enquiries and intake conversations.',
    heldIn: ['ADJUSTING_FIRM', 'INSURER'],
    customerInformation: 'REDACTED',
    needToKnow:
      'Contact details and claim status to answer an enquiry — not identity numbers, financials, documents or fraud data.',
  },
  SIU_INVESTIGATOR: {
    purpose: "Insurer's special investigations unit: reviews fraud indicators on its own claims.",
    heldIn: ['INSURER'],
    customerInformation: 'CASE_SCOPED',
    needToKnow: 'Fraud and risk indicators on claims the insurer owns, to decide on referral.',
  },
  SHARIAH_REVIEWER: {
    purpose: "Takaful operator's Shariah review of claims (IFSA 2013) — read-only.",
    heldIn: ['INSURER'],
    customerInformation: 'REDACTED',
    needToKnow:
      "The claim facts, amounts and the adjuster's report. No identity numbers, dates of birth, documents or fraud data.",
  },
  CLAIMANT: {
    purpose: 'The person claiming.',
    heldIn: ['CLAIMANT'],
    customerInformation: 'OWN_RECORD',
    needToKnow: 'Their own claims and nothing else.',
  },
};
