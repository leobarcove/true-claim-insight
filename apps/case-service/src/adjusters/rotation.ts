/**
 * Rotation of adjusting assignments — PD 11.2(b), as a pure decision.
 *
 * The concern is capture: the same adjuster handling every claim from one
 * insurer, indefinitely, is the relationship 10.3 worries about grown by
 * habit rather than declared. Rotation is an advisory, never a block — the PD
 * asks for controls to "manage and monitor", and a hard rotation rule would
 * regularly force the *less* qualified adjuster onto a claim, which 12.2(b)
 * forbids from the other direction. The advisory on the audit row is the
 * monitoring.
 */

export const ROTATION_RUN_THRESHOLD = 3;

/**
 * Should this assignment carry a rotation advisory?
 *
 * `recentAdjusterIds` are the adjusters of this insurer's most recent claims,
 * newest first. A run of the threshold length, all the candidate, means the
 * candidate would extend an unbroken streak — worth a line on the record.
 */
export function rotationAdvisory(
  recentAdjusterIds: (string | null)[],
  candidateId: string,
  threshold: number = ROTATION_RUN_THRESHOLD
): string | null {
  if (recentAdjusterIds.length < threshold) return null;

  const run = recentAdjusterIds.slice(0, threshold);
  if (!run.every(id => id === candidateId)) return null;

  return (
    `rotation: this adjuster has handled this insurer's last ${threshold}+ assignments in a row ` +
    '(PD 11.2(b) — consider rotating)'
  );
}
