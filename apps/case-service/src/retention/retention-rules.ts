/**
 * Retention arithmetic — when a record may be purged, as pure decisions.
 *
 * BNM Adjuster PD 12.8 requires adjusting records, including photographs,
 * police and bomba reports and statements, to be retained for at least seven
 * years. The rules here answer the only question that matters at purge time:
 * *is destroying this record permissible right now?* — and they answer "no"
 * whenever any doubt exists, because an over-retained record is a storage cost
 * while an under-retained one is a destroyed piece of regulatory evidence.
 */

/** PD 12.8. A floor, not a default — policies may lengthen it, never shorten. */
export const RETENTION_FLOOR_YEARS = 7;

export interface PurgeQuestion {
  /** When the claim closed. Null means it has not — retention has not begun. */
  claimClosedAt: Date | null;
  /** Legal hold on the claim, if any. Outranks the calendar entirely. */
  legalHoldAt: Date | null;
  /** The applicable policy's retention period. */
  retainYears: number;
  now: Date;
}

export interface PurgeDecision {
  allowed: boolean;
  /** Recorded on the purge audit row, so the basis is never reconstructed. */
  basis: string;
}

/** The date from which purging first becomes permissible, or null if never yet. */
export function purgeEligibleFrom(
  claimClosedAt: Date | null,
  retainYears: number
): Date | null {
  if (!claimClosedAt) return null;

  const eligible = new Date(claimClosedAt.getTime());
  eligible.setUTCFullYear(eligible.getUTCFullYear() + Math.max(retainYears, RETENTION_FLOOR_YEARS));
  return eligible;
}

/**
 * May this record be purged now?
 *
 * Order matters: the legal hold is checked before the arithmetic, because a
 * hold suspends purging *regardless* of how long ago the claim closed —
 * litigation and regulator requests outrank the calendar.
 */
export function canPurge(question: PurgeQuestion): PurgeDecision {
  const { claimClosedAt, legalHoldAt, retainYears, now } = question;

  if (legalHoldAt) {
    return {
      allowed: false,
      basis: `legal hold in place since ${legalHoldAt.toISOString().slice(0, 10)}; purging suspended`,
    };
  }

  if (!claimClosedAt) {
    return {
      allowed: false,
      basis: 'claim is not closed; the retention period has not started',
    };
  }

  const eligibleFrom = purgeEligibleFrom(claimClosedAt, retainYears)!;
  if (now.getTime() < eligibleFrom.getTime()) {
    return {
      allowed: false,
      basis:
        `retention runs until ${eligibleFrom.toISOString().slice(0, 10)} ` +
        `(claim closed ${claimClosedAt.toISOString().slice(0, 10)}, ` +
        `${Math.max(retainYears, RETENTION_FLOOR_YEARS)} years)`,
    };
  }

  return {
    allowed: true,
    basis:
      `retention period ended ${eligibleFrom.toISOString().slice(0, 10)}; ` +
      'no legal hold; purge permissible',
  };
}

/**
 * Validate a retention period against the floor.
 *
 * Enforced in the service *and* by a database check constraint — the constraint
 * outlives the service, catching a row written through psql or a future admin
 * screen that forgot this rule.
 */
export function assertRetentionYears(retainYears: number): void {
  if (!Number.isInteger(retainYears) || retainYears < RETENTION_FLOOR_YEARS) {
    throw new RangeError(
      `Retention must be at least ${RETENTION_FLOOR_YEARS} years (PD 12.8); received ${retainYears}. ` +
        'The floor may be raised per policy, never lowered.'
    );
  }
}
