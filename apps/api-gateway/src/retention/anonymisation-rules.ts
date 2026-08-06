import { randomUUID } from 'node:crypto';

/**
 * Claimant anonymisation — PDPA s.10(2) read with BNM PD 12.8.
 *
 * The two obligations pull in opposite directions and both must be satisfied:
 * PD 12.8 requires the adjusting record for seven years, and PDPA requires
 * personal data not be kept longer than the purpose needs. Anonymisation is how
 * both hold at once — the firm keeps what it did, and stops holding who it was
 * done to.
 *
 * ## Anonymisation, not pseudonymisation
 *
 * If the transform can be reversed, the result is still personal data and PDPA
 * still applies to it. So the replacements here are **random**, never derived:
 *
 *  - Hashing a phone number is reversible by brute force. Malaysian mobile
 *    numbers are a space of a few hundred million, which is minutes of compute.
 *  - Keeping the NRIC blind index would leave the strongest re-identification
 *    vector in the database. It is an HMAC, so it survives the plaintext being
 *    destroyed and matches any future NRIC put through the same pepper.
 *  - Keeping `nricLast4` narrows a candidate set by four orders of magnitude
 *    and, with a date of birth, usually identifies one person.
 *
 * ## What survives, and why
 *
 * The claimant row itself stays, so claims still resolve and the firm's record
 * of what it assessed remains coherent. Timestamps and tenant survive: they say
 * when a claim was handled and by whom, and identify nobody. Deleting the row
 * outright would orphan claims and destroy the PD 12.8 record the retention
 * period exists to protect.
 */

/** Fields carrying identity, and what each becomes. */
export interface AnonymisedClaimant {
  /** Destroyed: the strongest re-identification vector in the schema. */
  nricHash: null;
  /** Destroyed: ciphertext is personal data held under a key we also hold. */
  nricEncrypted: null;
  /** Destroyed: four digits plus a birth date usually identifies one person. */
  nricLast4: null;
  fullName: null;
  dateOfBirth: null;
  email: null;
  /**
   * Replaced, not nulled: the column is required and unique, and it is the
   * natural key intake resolves a claimant by. A random token keeps the row
   * valid and joinable while matching nothing a person could present.
   */
  phoneNumber: string;
  anonymisedAt: Date;
}

/**
 * Build the anonymised values.
 *
 * `now` is a parameter so a sweep stamps one time across a batch, and so the
 * decision is testable without freezing the clock.
 */
export function anonymiseClaimant(now: Date = new Date()): AnonymisedClaimant {
  return {
    nricHash: null,
    nricEncrypted: null,
    nricLast4: null,
    fullName: null,
    dateOfBirth: null,
    email: null,
    // Namespaced so an operator reading the column sees why it looks like this,
    // and random so it carries nothing of the number it replaced.
    phoneNumber: `anonymised:${randomUUID()}`,
    anonymisedAt: now,
  };
}

/** Does this value look like an anonymised placeholder rather than a number? */
export function isAnonymisedPhone(value: string): boolean {
  return value.startsWith('anonymised:');
}

export interface AnonymisationQuestion {
  /** Every claim naming this claimant. */
  claims: { closedAt: Date | null; legalHoldAt: Date | null }[];
  retainYears: number;
  now: Date;
}

export interface AnonymisationDecision {
  allowed: boolean;
  /** Recorded on the audit row, so the basis is never reconstructed later. */
  basis: string;
}

/**
 * May this claimant be anonymised now?
 *
 * The test is over **every** claim naming them, not the latest. A person with a
 * ten-year-old settled claim and one opened last week is still a live claimant,
 * and anonymising them would destroy the identity the open claim depends on.
 * One held or open claim keeps the whole person.
 */
export function canAnonymise(question: AnonymisationQuestion): AnonymisationDecision {
  const { claims, retainYears, now } = question;

  if (claims.length === 0) {
    // A claimant with no claims has no PD 12.8 record to protect, but also no
    // established purpose — and deciding that case needs a policy this system
    // does not have. Refused rather than guessed.
    return {
      allowed: false,
      basis: 'Claimant has no claims; retention basis cannot be established',
    };
  }

  const held = claims.find(claim => claim.legalHoldAt);
  if (held) {
    // Checked before the arithmetic: a hold outranks the calendar entirely.
    return { allowed: false, basis: 'A claim is under legal hold' };
  }

  const open = claims.find(claim => !claim.closedAt);
  if (open) {
    return { allowed: false, basis: 'A claim is still open; retention has not begun' };
  }

  const years = Math.max(retainYears, 7);
  const newest = claims.reduce<Date>(
    (latest, claim) => (claim.closedAt! > latest ? claim.closedAt! : latest),
    claims[0].closedAt!
  );

  const eligibleFrom = new Date(newest.getTime());
  eligibleFrom.setUTCFullYear(eligibleFrom.getUTCFullYear() + years);

  if (now < eligibleFrom) {
    return {
      allowed: false,
      basis: `Retention runs to ${eligibleFrom.toISOString().slice(0, 10)} (${years} years from the most recent closure)`,
    };
  }

  return {
    allowed: true,
    basis: `All claims closed by ${newest.toISOString().slice(0, 10)}; ${years}-year retention elapsed`,
  };
}
