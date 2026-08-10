import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../auth/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { UpdateTenantSettingsDto } from './dto/update-settings.dto';
import { tenantSettings, type TenantSettings } from './tenant-settings';

/**
 * Per-tenant configuration (MASTER_PLAN §4.2).
 *
 * Lives in the gateway, not case-service, because `Tenant` belongs to the
 * **identity** context and the gateway owns it. The first placement put it in
 * case-service and the data-ownership ratchet refused it — which is the test
 * doing exactly its job: a settings writer in the wrong service is how a schema
 * change silently breaks three others.
 *
 * case-service still *reads* these settings. Cross-context reads are permitted;
 * it is the writes that need one owner.
 *
 * These settings gate regulated behaviour — whether a countersign blocks,
 * which calendar computes a CSP deadline, whether a claim can skip an
 * interview — so every change is audited with its before and after. An
 * examiner asking "on whose authority did this firm stop requiring a senior
 * signature" needs an answer, and the answer is a row.
 */
@Injectable()
export class TenantConfigService {
  private readonly logger = new Logger(TenantConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  /**
   * The tenant's settings, with defaults made explicit.
   *
   * Returns what the system will actually do rather than only what was stored,
   * so a firm admin reading the screen sees the effective configuration —
   * "licensedMode absent" and "licensedMode false" behave identically and
   * should read identically.
   */
  async read(tenantId: string, tenantContext: TenantContext) {
    const tenant = await this.load(tenantId, tenantContext);
    const stored = tenantSettings(tenant.settings);

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      settings: {
        licensedMode: stored.licensedMode ?? false,
        calendarState: stored.calendarState ?? 'Kuala Lumpur',
        fastTrackCategories: stored.fastTrackCategories ?? [],
        fastTrackLimits: stored.fastTrackLimits ?? {},
        siteVisitCategories: stored.siteVisitCategories ?? [],
        siteVisitThresholds: stored.siteVisitThresholds ?? {},
        brandingName: stored.brandingName ?? tenant.name,
      },
    };
  }

  /**
   * Merge a partial change into the stored settings.
   *
   * A merge rather than a replace: a screen that edits fast-track limits must
   * not silently clear `licensedMode` because it did not send it. Nested maps
   * are replaced wholesale when named, though — a limits object arriving
   * without a category means that category's ceiling was removed, which is a
   * deliberate act an operator can take.
   */
  async update(tenantId: string, dto: UpdateTenantSettingsDto, tenantContext: TenantContext) {
    const tenant = await this.load(tenantId, tenantContext);
    const before = tenantSettings(tenant.settings);

    const { reason, ...changes } = dto;

    // Flipping registered status is not a preference. It turns advisory
    // controls into hard gates across sign-off, competency and conflicts, and
    // claiming registration the firm does not hold is the worse error in both
    // directions — so it must be a deliberate, explained act.
    const flippingLicensedMode =
      changes.licensedMode !== undefined && changes.licensedMode !== (before.licensedMode ?? false);

    if (flippingLicensedMode && !reason?.trim()) {
      throw new BadRequestException(
        'Changing licensed mode requires a reason — it turns advisory compliance gates into ' +
          'blocking ones, and the change must be explicable later.'
      );
    }

    const after: TenantSettings = { ...before };
    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined) (after as Record<string, unknown>)[key] = value;
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: after as unknown as Prisma.InputJsonValue },
      select: { id: true, name: true, settings: true },
    });

    await this.audit.record({
      entityType: 'TENANT',
      entityId: tenantId,
      action: flippingLicensedMode ? 'TENANT_LICENSED_MODE_CHANGED' : 'TENANT_SETTINGS_UPDATED',
      tenantId: tenantContext.tenantId,
      userId: tenantContext.userId,
      actorId: tenantContext.userId,
      actorType: tenantContext.userRole ?? 'SYSTEM',
      // Only the keys that were touched. Recording the whole object every time
      // would bury the one field that changed in a diff of everything.
      oldValues: pick(before, Object.keys(changes)),
      newValues: pick(after, Object.keys(changes)),
      metadata: reason ? { reason } : undefined,
    });

    if (flippingLicensedMode) {
      this.logger.warn(
        `Tenant ${tenantId} licensed mode → ${changes.licensedMode} by ${tenantContext.userId}: ${reason}`
      );
    }

    return this.read(updated.id, tenantContext);
  }

  private async load(tenantId: string, tenantContext: TenantContext) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, settings: true },
    });

    // Existence check, not an access check — a tenant that is not yours must be
    // indistinguishable from one that does not exist.
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.id !== tenantContext.tenantId && tenantContext.userRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException('You cannot read or change another organisation’s settings');
    }
    return tenant;
  }
}

function pick(source: TenantSettings, keys: string[]): Record<string, unknown> {
  const bag = source as Record<string, unknown>;
  return Object.fromEntries(keys.map(key => [key, bag[key] ?? null]));
}
