import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { TenantScope } from '../common/decorators/tenant.decorator';
import { assertClaimAccess } from '../common/access/claim-access';

/**
 * TenantService provides utilities for multi-tenant data access.
 *
 * Key responsibilities:
 * 1. Validate resource ownership against tenant context
 * 2. Build tenant-scoped query filters
 * 3. Provide helpers for cross-tenant admin operations
 */
@Injectable()
export class TenantService {
  private readonly logger = new Logger(TenantService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a where clause with tenant and user filtering applied
   *
   * @param tenantContext - The tenant context from the request
   * @param existingWhere - Any existing where conditions
   * @param options - Configuration for fields to filter on
   * @returns Combined where clause with tenant/user filters
   */
  buildTenantFilter<T extends Record<string, any>>(
    tenantContext: TenantContext | null,
    existingWhere: T = {} as T,
    options: {
      tenantField?: string;
      userIdField?: string;
      enforceUser?: boolean;
    } = {}
  ): T {
    const { tenantField = 'tenantId', userIdField = 'userId', enforceUser = false } = options;

    if (!tenantContext || tenantContext.scope === TenantScope.NONE) {
      return existingWhere;
    }

    // For STRICT scope, always apply tenant filter
    // For FLEXIBLE scope, apply unless allowCrossTenant is true and user is admin
    if (
      tenantContext.scope === TenantScope.STRICT ||
      (tenantContext.scope === TenantScope.FLEXIBLE && !this.canAccessCrossTenant(tenantContext))
    ) {
      const filter: any = {
        [tenantField]: tenantContext.tenantId,
      };

      // Apply userId filter if enforced or if user is a claimant
      if (enforceUser || (tenantContext.userRole === 'CLAIMANT' && userIdField)) {
        filter[userIdField] = tenantContext.userId;
      }

      return {
        ...existingWhere,
        ...filter,
      };
    }

    return existingWhere;
  }

  /**
   * Build tenant filter for claims (uses adjusterId relationship or insurerTenantId)
   */
  buildClaimTenantFilter(
    tenantContext: TenantContext | null,
    existingWhere: Record<string, any> = {}
  ): Record<string, any> {
    if (!tenantContext || tenantContext.scope === TenantScope.NONE) {
      return existingWhere;
    }

    if (
      tenantContext.scope === TenantScope.STRICT ||
      (tenantContext.scope === TenantScope.FLEXIBLE && !this.canAccessCrossTenant(tenantContext))
    ) {
      // For CLAIMANT, only show their own claims
      if (tenantContext.userRole === 'CLAIMANT') {
        return {
          ...existingWhere,
          claimantId: tenantContext.userId,
        };
      }

      // Strict Tenant Isolation: a tenant sees the claims it owns. An insurer
      // also sees the claims it appointed a firm to handle — the customer is
      // the insurer's, and it may read the adjuster's file (FSA Sch 11 item
      // 17); what it may not do is write the adjuster's work, which is
      // enforced where that work is written, not here.
      const tenantConditions: Record<string, string>[] = [{ tenantId: tenantContext.tenantId }];
      if (tenantContext.tenantType === 'INSURER') {
        tenantConditions.push({ insurerTenantId: tenantContext.tenantId });
      }

      if (existingWhere.OR) {
        const { OR: existingOR, ...rest } = existingWhere;
        return {
          ...rest,
          AND: [...(rest.AND || []), { OR: existingOR }, { OR: tenantConditions }],
        } as any;
      }

      return {
        ...existingWhere,
        OR: tenantConditions,
      };
    }

    return existingWhere;
  }

  /**
   * Validate that a resource belongs to the user's tenant.
   *
   * Refuses as absence. The caller has already fetched the row, so a distinct
   * "not yours" answer would confirm the id names something real in another
   * firm's book — walk ids, keep the refusals, and you have a map of their
   * portfolio without reading a single record. The server still knows the
   * difference and says so in the log below; the client never does.
   *
   * @throws NotFoundException on tenant mismatch, worded as a genuine miss
   */
  validateTenantAccess(
    resourceTenantId: string | null,
    tenantContext: TenantContext,
    resourceName: string = 'Resource'
  ): void {
    if (tenantContext.scope === TenantScope.NONE) {
      return;
    }

    if (this.canAccessCrossTenant(tenantContext)) {
      return;
    }

    if (resourceTenantId !== tenantContext.tenantId) {
      this.logger.warn(
        `Tenant access violation: User ${tenantContext.userId} (tenant: ${tenantContext.tenantId}) ` +
          `attempted to access ${resourceName} belonging to tenant ${resourceTenantId}`
      );
      throw new NotFoundException(`${resourceName} not found`);
    }
  }

  /**
   * Validate claim access based on adjuster's tenant or insurer tenant
   */
  async validateClaimAccess(claimId: string, tenantContext: TenantContext): Promise<void> {
    // The rule itself lives in one function so services that hold only a
    // Prisma client apply exactly the same one (common/access/claim-access.ts).
    await assertClaimAccess(this.prisma, claimId, tenantContext);
  }

  /**
   * Check if user can access resources across tenants
   * Only SUPER_ADMIN and users with explicit allowCrossTenant flag
   */
  private canAccessCrossTenant(tenantContext: TenantContext): boolean {
    return tenantContext.allowCrossTenant && ['SUPER_ADMIN'].includes(tenantContext.userRole);
  }

  /** Tenant types never change after creation, so they are cached for the process. */
  private readonly tenantTypes = new Map<string, string>();

  /**
   * The type of a tenant (ADJUSTING_FIRM | INSURER), or null when it does not
   * exist. Read on every tenant-scoped request, hence the cache.
   */
  async getTenantType(tenantId: string | null | undefined): Promise<string | null> {
    if (!tenantId) return null;
    const cached = this.tenantTypes.get(tenantId);
    if (cached) return cached;
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { type: true },
    });
    if (!tenant) return null;
    this.tenantTypes.set(tenantId, tenant.type);
    return tenant.type;
  }

  /**
   * Get tenant by ID with caching
   */
  async getTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${tenantId} not found`);
    }

    return tenant;
  }

  /**
   * Validate tenant exists and is active
   */
  async validateTenant(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    return !!tenant;
  }
  /**
   * Redact sensitive claim data based on user role
   */
  redactClaim(claim: any, tenantContext: TenantContext): any {
    if (!claim) return null;

    const role = tenantContext.userRole;
    const isHighPrivilege = ['FIRM_ADMIN', 'SUPER_ADMIN', 'SIU_INVESTIGATOR'].includes(role);

    const redacted = { ...claim };

    // 1. PII Masking (NRIC) — top-level and the nested claimant record, which
    // is routinely attached via `include: { claimant: true }`. Fail closed:
    // if the value doesn't match the canonical NRIC shape, mask it entirely
    // rather than letting a non-standard format pass through unredacted.
    const maskNric = (value: string) => {
      const match = value.match(/^(\d{6})-?(\d{2})-?(\d{4})$/);
      return match ? `********${match[3]}` : '************';
    };
    // NRIC is encrypted at rest, so there is no plaintext to mask: strip the
    // ciphertext and the blind index from every response (a browser has no use
    // for either, and the index is a lookup key) and let `nricLast4` carry
    // display. `maskNric` remains for any legacy plaintext still in flight.
    if (redacted.nric && !isHighPrivilege) {
      redacted.nric = maskNric(redacted.nric);
    }
    delete redacted.nricEncrypted;
    if (redacted.claimant) {
      redacted.claimant = { ...redacted.claimant };
      delete redacted.claimant.nricEncrypted;
      delete redacted.claimant.nricHash;
      if (redacted.claimant.nric && !isHighPrivilege) {
        redacted.claimant.nric = maskNric(redacted.claimant.nric);
      }
      if (['CLAIMANT', 'SUPPORT_DESK', 'SHARIAH_REVIEWER'].includes(role)) {
        delete redacted.claimant.dateOfBirth;
      }
    }

    // 2. Financial & Risk Redaction
    if (['SUPPORT_DESK', 'CLAIMANT'].includes(role)) {
      delete redacted.estimatedRepairCost;
      delete redacted.approvedAmount;
      delete redacted.excessAmount;
      delete redacted.sumInsured;
      delete redacted.trinityChecks;
    }

    // 2b. Behavioural/fraud analysis never reaches claimants, support desk or
    // a Shariah reviewer. FSA Sch 7 (misleading/deceptive conduct) and basic
    // fairness: deception scores and fraud signals are internal work product,
    // not consumer output — and outside a Shariah review's need-to-know
    // (MCIPD 10.25; ROLE_PROFILES in @tci/shared-types).
    if (['SUPPORT_DESK', 'CLAIMANT', 'SHARIAH_REVIEWER'].includes(role)) {
      delete redacted.deceptionData;
      delete redacted.riskAssessments;
      delete redacted.fraudSignals;
      if (Array.isArray(redacted.sessions)) {
        redacted.sessions = redacted.sessions.map((session: any) => {
          const cleaned = { ...session };
          delete cleaned.summary;
          delete cleaned.deceptionScores;
          delete cleaned.riskAssessments;
          delete cleaned.screenshots;
          delete cleaned.clientInfos;
          return cleaned;
        });
      }
      if (redacted.summary) {
        const { deceptionScore, isHighRisk, ...safeSummary } = redacted.summary;
        redacted.summary = safeSummary;
      }
    }

    // 3. SIU & Private Note Isolation
    if (redacted.notes) {
      redacted.notes = redacted.notes.filter((n: any) => {
        if (n.isPrivate && !isHighPrivilege) return false;
        if (role === 'ADJUSTER' && n.authorType === 'SIU_INVESTIGATOR') return false;
        return true;
      });
    }

    if (role === 'ADJUSTER' && redacted.status === 'ESCALATED_SIU') {
      redacted.statusDisplay = 'UNDER_REVIEW'; // Obfuscate SIU status
    }

    return redacted;
  }
}
