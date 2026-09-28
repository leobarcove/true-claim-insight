import { isRoleAllowedInTenant, PLATFORM_ROLE } from '@tci/shared-types';

/** A membership as the users service returns it, tenant type included. */
export interface MembershipLike {
  tenantId: string;
  role: string;
  status: string;
  tenant?: { type: string } | null;
}

export interface EffectiveRole {
  /** The role this request acts with, or null when the identity holds none here. */
  role: string | null;
  /** The tenant the request acts in. */
  tenantId: string | null;
  tenantType: string | null;
  /** Why `role` is null — logged, never shown to the caller. */
  refusal?: string;
}

/**
 * Which role does this identity hold for this request?
 *
 * A role belongs to a membership, not to a person (the same person can be a
 * firm-admin in one tenant and nobody in another), so it is read from the
 * membership for the tenant the request names — the `X-Tenant-Id` header when
 * sent, otherwise the session's current tenant. `users.role` is consulted for
 * one thing only: whether the person is the platform operator, the single role
 * that exists outside every tenant.
 *
 * Refusal is a null role rather than an exception. An identity with no role
 * can still read its own profile or switch tenant; every route that needs a
 * role is closed to it by the roles guard, which denies by default.
 *
 * A membership whose role cannot exist in that kind of tenant (an ADJUSTER
 * inside an insurer) is refused here even if the row says ACTIVE — the data
 * may predate the rule, and this is the place that cannot be bypassed.
 */
export function resolveEffectiveRole(input: {
  platformRole: string | null | undefined;
  requestedTenantId?: string | null;
  sessionTenantId?: string | null;
  memberships: ReadonlyArray<MembershipLike>;
}): EffectiveRole {
  const tenantId = input.requestedTenantId || input.sessionTenantId || null;
  const membership = tenantId
    ? input.memberships.find(candidate => candidate.tenantId === tenantId)
    : undefined;
  const tenantType = membership?.tenant?.type ?? null;

  if (input.platformRole === PLATFORM_ROLE) {
    return { role: PLATFORM_ROLE, tenantId, tenantType };
  }

  if (!tenantId) {
    return { role: null, tenantId: null, tenantType: null, refusal: 'no tenant selected' };
  }
  if (!membership) {
    return { role: null, tenantId, tenantType: null, refusal: 'no membership in this tenant' };
  }
  if (membership.status !== 'ACTIVE') {
    return { role: null, tenantId, tenantType, refusal: `membership is ${membership.status}` };
  }
  if (!isRoleAllowedInTenant(membership.role, tenantType)) {
    return {
      role: null,
      tenantId,
      tenantType,
      refusal: `role ${membership.role} cannot exist in a ${tenantType ?? 'unknown'} tenant`,
    };
  }
  return { role: membership.role, tenantId, tenantType };
}
