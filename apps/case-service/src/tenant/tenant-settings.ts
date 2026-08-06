import { Prisma } from '@prisma/client';

/**
 * Typed reader for `Tenant.settings`.
 *
 * The column is free-form JSON, which is how it came to hold nothing at all. The
 * settings that gate regulated behaviour need to be read the same way everywhere,
 * with a safe default when absent — a missing flag must never accidentally
 * enable a control the firm is not yet authorised to operate under, nor disable
 * one it is.
 */
export interface TenantSettings {
  /**
   * Is this firm a BNM-registered adjuster?
   *
   * The whole point of the flag (docs/MASTER_PLAN.md §1): the regulated machinery
   * — qualified-author restriction, senior countersign, COI screening — is built
   * and shipped now, but only *blocks* once registration is real. Operating as a
   * TPA, the same checks run and are recorded as advisory, so the firm arrives at
   * registration with a working system and a history of compliance rather than a
   * rebuild.
   *
   * Defaults to false. Claiming registered status the firm does not hold would be
   * a far worse error than running a gate advisorily.
   */
  licensedMode?: boolean;

  /** Malaysian state whose working-day calendar applies to this firm's claims. */
  calendarState?: string;

  /**
   * Claim categories this firm is willing to settle on a desk review, and the
   * value ceiling for each (MASTER_PLAN §2.4).
   *
   * Both absent by default, and absence means **no fast track** rather than an
   * unlimited one: a firm that has not decided its ceilings has not decided to
   * skip interviews either. Limits are decimal strings for the same reason the
   * quantum DTO uses them — a JSON number is a float, and this one gates how a
   * claim is examined.
   */
  fastTrackCategories?: string[];
  fastTrackLimits?: Record<string, string>;
}

export function tenantSettings(settings: unknown): TenantSettings {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
  return settings as TenantSettings;
}

/** Is the firm operating as a BNM-registered adjuster? Defaults to no. */
export function isLicensedMode(settings: unknown): boolean {
  return tenantSettings(settings).licensedMode === true;
}

/**
 * The firm's desk-review policy, in the shape the router expects.
 *
 * A category listed with no limit is deliberately left without one here too —
 * the router treats that as a configuration gap and refuses the fast track,
 * which is safer than inventing a ceiling on the firm's behalf.
 */
export function fastTrackPolicy(settings: unknown): {
  categories: string[];
  limits: Record<string, Prisma.Decimal>;
} {
  const parsed = tenantSettings(settings);
  const limits: Record<string, Prisma.Decimal> = {};

  for (const [category, value] of Object.entries(parsed.fastTrackLimits ?? {})) {
    try {
      limits[category] = new Prisma.Decimal(value);
    } catch {
      // A malformed ceiling is dropped rather than defaulted. The category then
      // has no limit, and the router refuses to fast-track it — the same
      // outcome as never configuring it, which is the safe reading.
    }
  }

  return { categories: parsed.fastTrackCategories ?? [], limits };
}
