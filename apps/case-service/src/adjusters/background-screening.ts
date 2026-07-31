/**
 * Background-screening standing — PD 11.2(e), as pure decisions.
 *
 * The paragraph names its own minimum: financial history (bankruptcy or
 * insolvency), employment history, academic history, and security screening
 * for past criminal involvement. That minimum is data here, so "screened" has
 * one definition and a missing check is visible, not assumed away.
 */

/** The checks 11.2(e) lists as "at a minimum". OTHER never substitutes. */
export const MINIMUM_CHECKS = [
  'BANKRUPTCY_INSOLVENCY',
  'EMPLOYMENT_HISTORY',
  'ACADEMIC_HISTORY',
  'CRIMINAL_SCREENING',
] as const;

export type MinimumCheck = (typeof MINIMUM_CHECKS)[number];

export interface ScreeningEntry {
  checkType: string;
  outcome: string;
  screenedAt: Date;
}

export interface ScreeningStanding {
  complete: boolean;
  /** Minimum checks with no record at all. */
  missing: MinimumCheck[];
  /**
   * Checks performed after the adjuster's employment began. Recorded honestly:
   * a late check still counts toward completeness — the assurance exists — but
   * "prior to employment" it was not, and the record should say so.
   */
  late: MinimumCheck[];
  /** Checks whose outcome is FINDINGS — visible, not disqualifying. */
  withFindings: MinimumCheck[];
}

export function screeningStanding(
  entries: ScreeningEntry[],
  adjustingSince: Date | null | undefined
): ScreeningStanding {
  const missing: MinimumCheck[] = [];
  const late: MinimumCheck[] = [];
  const withFindings: MinimumCheck[] = [];

  for (const check of MINIMUM_CHECKS) {
    // Earliest record of the kind governs "prior to employment".
    const ofKind = entries
      .filter(entry => entry.checkType === check)
      .sort((a, b) => a.screenedAt.getTime() - b.screenedAt.getTime());

    if (!ofKind.length) {
      missing.push(check);
      continue;
    }
    if (adjustingSince && ofKind[0].screenedAt.getTime() > adjustingSince.getTime()) {
      late.push(check);
    }
    if (ofKind.some(entry => entry.outcome === 'FINDINGS')) {
      withFindings.push(check);
    }
  }

  return { complete: missing.length === 0, missing, late, withFindings };
}

/** Advisory wording for an assignment when the minimum set is incomplete. */
export function screeningAdvisory(standing: ScreeningStanding): string | null {
  if (standing.complete) return null;
  return (
    `pre-employment screening incomplete: no record of ${standing.missing.join(', ')} ` +
    '(PD 11.2(e) minimum)'
  );
}
