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
}

export function tenantSettings(settings: unknown): TenantSettings {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return {};
  return settings as TenantSettings;
}

/** Is the firm operating as a BNM-registered adjuster? Defaults to no. */
export function isLicensedMode(settings: unknown): boolean {
  return tenantSettings(settings).licensedMode === true;
}
