/**
 * Conflict-of-interest screening — PD 10.3, 12.1(d), as pure decisions.
 *
 * A declared, unresolved conflict that matches the claim's parties blocks the
 * assignment in **every** mode, not only once registered. The licence flip
 * governs gaps the firm might not know about; this is a conflict the firm has
 * *on record* — assigning through it is a choice, and 12.1(d) says the choice
 * is not available.
 *
 * The screen can only match what has been declared. That is inherent to any
 * COI regime — the declarations register plus the per-claim attestation is the
 * mechanism, not a heuristic that guesses at undeclared interests.
 */

export interface DeclarationLike {
  id: string;
  partyType: string;
  partyName: string;
  partyTenantId: string | null;
  relationship: string;
  resolvedAt: Date | null;
}

export interface ClaimParties {
  insurerTenantId: string | null;
  workshopName: string | null;
}

export interface ScreeningResult {
  clear: boolean;
  /** Declarations that match this claim's parties, for the refusal message. */
  matches: DeclarationLike[];
  /** How many live declarations were screened — recorded so "clear" is
   * distinguishable from "nothing was ever declared". */
  screened: number;
}

const normalise = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();

/** Does this declaration touch one of the claim's parties? */
export function declarationMatchesClaim(
  declaration: DeclarationLike,
  claim: ClaimParties
): boolean {
  if (declaration.resolvedAt) return false;

  // Tenant-id match is authoritative: the declared party IS the claim's insurer.
  if (declaration.partyTenantId && declaration.partyTenantId === claim.insurerTenantId) {
    return true;
  }

  // Workshop matching is by name — workshops are not tenants. Substring both
  // ways so "Ah Seng Motor Workshop" matches a declaration of "Ah Seng Motor".
  if (declaration.partyType === 'WORKSHOP' && claim.workshopName) {
    const declared = normalise(declaration.partyName);
    const onClaim = normalise(claim.workshopName);
    if (declared && onClaim && (onClaim.includes(declared) || declared.includes(onClaim))) {
      return true;
    }
  }

  return false;
}

export function screenConflicts(
  declarations: DeclarationLike[],
  claim: ClaimParties
): ScreeningResult {
  const live = declarations.filter(declaration => !declaration.resolvedAt);
  const matches = live.filter(declaration => declarationMatchesClaim(declaration, claim));

  return { clear: matches.length === 0, matches, screened: live.length };
}

/** The refusal message, naming what the firm already knows. */
export function conflictRefusalReason(matches: DeclarationLike[]): string {
  const described = matches
    .map(match => `${match.relationship} — ${match.partyType} "${match.partyName}"`)
    .join('; ');

  return (
    `Assignment refused: this adjuster has an unresolved declared conflict with a party to ` +
    `this claim (${described}). PD 12.1(d) requires conflict situations to be avoided, and ` +
    'this one is on record — resolve the declaration or assign someone else.'
  );
}
