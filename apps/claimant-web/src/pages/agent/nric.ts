/**
 * A Malaysian IC number, as it is written on the card.
 *
 * Twelve digits in three groups: six for the date of birth, two for the place
 * of birth, four that end in the digit encoding sex. The dashes are how
 * everybody reads one back — an agent checking what they typed against a card
 * held up on a video call, or read out over the phone, is comparing groups, not
 * a run of twelve digits.
 *
 * The server strips punctuation before it hashes or takes the last four
 * (`blindIndex` and `lastDigits` in `@tci/crypto`), so the dashes are purely
 * for the person typing and cannot change what is stored or looked up.
 */

/** How many digits an IC has. Anything longer is a typo, not a longer IC. */
export const NRIC_DIGITS = 12;

/** `981010101010` → `981010-10-1010`, and stops accepting at twelve digits. */
export function formatNric(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, NRIC_DIGITS);

  if (digits.length <= 6) return digits;
  if (digits.length <= 8) return `${digits.slice(0, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

/** Just the digits, for asking "is this finished?" */
export function nricDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Whether this is a complete IC.
 *
 * Blank counts as complete: the IC is optional here — an agent may be opening a
 * claim for somebody whose card is not to hand. A *partial* one is the case
 * worth catching, because it hashes to a value that matches nothing and quietly
 * creates a second record for a claimant we already had.
 */
export function isCompleteNric(value: string): boolean {
  const digits = nricDigits(value);
  return digits.length === 0 || digits.length === NRIC_DIGITS;
}
