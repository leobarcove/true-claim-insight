import { ForbiddenException } from '@nestjs/common';
import { holdsAdjusterDuties, isSelfAction, mayAuthorAdjusterWork } from '@tci/shared-types';
import { TenantContext } from '../guards/tenant.guard';

/**
 * The access rules `@Roles` cannot express, as assertions a service calls at
 * the point of the act. The rules themselves live in `@tci/shared-types`
 * (access-policy.ts) so the gateway and portals read the same ones.
 *
 * Each throws `ForbiddenException` with the reason in words — these refusals
 * are the controls working, and the person refused should be able to tell why.
 */

/**
 * The registered adjuster's own governance duties — fit and proper (PD 10),
 * Board escalation (11.2(d)), notifications to BNM (13) — are the adjusting
 * firm's. A panel insurer's compliance officer or administrator holds the same
 * role *name* but none of these duties, and must not read or write them.
 */
export function assertAdjusterDuties(tenantContext: TenantContext): void {
  if (!holdsAdjusterDuties(tenantContext.tenantType)) {
    throw new ForbiddenException(
      "These registers are the adjusting firm's own duties (BNM Adjuster PD 10, 11, 13); " +
        'they are not available to an insurer.'
    );
  }
}

/**
 * Adjusting work is done "independently and objectively" (PD 1.1, 12.1(c)).
 * Staff of an insurer read the adjuster's findings, quantum and reports; they
 * never write them. Fails closed when the tenant type is unknown.
 */
export function assertMayAuthorAdjusterWork(tenantContext: TenantContext, act: string): void {
  if (!mayAuthorAdjusterWork(tenantContext.tenantType)) {
    throw new ForbiddenException(
      `${act} is the adjusting firm's work. An insurer may read it but not write it ` +
        '(BNM Adjuster PD 1.1, 12.1(c) — independence).'
    );
  }
}

/**
 * Separation of duties: refuse the act when the actor is its subject.
 * `subjects` are user ids; unknown ones never match.
 */
export function assertNotSelf(
  tenantContext: TenantContext,
  subjects: ReadonlyArray<string | null | undefined>,
  act: string
): void {
  if (isSelfAction(tenantContext.userId, subjects)) {
    throw new ForbiddenException(
      `${act} must be done by someone other than the person it concerns (separation of duties).`
    );
  }
}
