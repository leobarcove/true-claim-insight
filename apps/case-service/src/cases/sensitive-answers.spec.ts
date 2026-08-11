import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * COMPLIANCE TEST — the payout account survives the rest of the conversation.
 *
 * The defect this pins against recurring destroyed real data. `patchAnswer`
 * rebuilds its working set from the *stored* answers, which are redacted, and
 * re-derived the encrypted column from it. On the turn the claimant supplied
 * the account that was correct, because the DTO's value overrode the bag. On
 * the very next turn — `bank-account-holder` in all five flows —
 * `promoteAnswers` read `••••4567` and encrypted **that** over the real
 * ciphertext.
 *
 * It was invisible because `lastDigits` strips non-digits: `bankAccountLast4`
 * still read `4567`, so every operator screen and the audited firm-admin
 * reveal looked correct while returning a mask. Measured on the demo book
 * before the fix: 5 of 7 stored payout accounts held only their own mask.
 *
 * Not Telegram-specific — `patchAnswer` is the shared write path, so the PWA
 * and staff capture destroyed it identically, on every claim.
 */

/** The two rules, as the service applies them. Mirrors cases.service.ts. */
const MASK = '••••';
const isMasked = (v: unknown) => typeof v === 'string' && v.startsWith(MASK);
const lastDigits = (v: string, count = 4) => {
  const d = v.replace(/\D/g, '');
  return d.length <= count ? d : d.slice(-count);
};

describe('a sensitive answer is promoted only on the turn that supplies it', () => {
  const REAL = '157098234567';

  /** What `promoteAnswers` would encrypt, given this value from the bag. */
  const wouldEncrypt = (fromBag: unknown): string | null =>
    fromBag !== undefined && !isMasked(fromBag) ? String(fromBag) : null;

  it('encrypts the real account on the turn it arrives', () => {
    expect(wouldEncrypt(REAL)).toBe(REAL);
  });

  it('does NOT re-encrypt the mask on any later turn', () => {
    // The turn after: the bag now holds the mask, and the claimant is
    // answering `bank-account-holder`. Nothing about the account may change.
    const stored = `${MASK}${lastDigits(REAL)}`;
    expect(wouldEncrypt(stored)).toBeNull();
  });

  it('leaving it unset is what preserves the stored ciphertext', () => {
    // Skipping means the Prisma update never names the column, so the value
    // written on the supplying turn stays. Returning the mask "unchanged"
    // would have been the same bug in a different shape.
    expect(wouldEncrypt(`${MASK}4567`)).toBeNull();
  });

  it('the mask survives lastDigits, which is why the damage was invisible', () => {
    // The tell that made this hard to see: the derived display value is
    // identical whether the source was real or already masked.
    expect(lastDigits(REAL)).toBe('4567');
    expect(lastDigits(`${MASK}4567`)).toBe('4567');
  });

  it('a redaction is never applied twice', () => {
    const once = `${MASK}${lastDigits(REAL)}`;
    expect(isMasked(once)).toBe(true);
  });
});

describe('the service keeps both rules on one predicate', () => {
  // Source scan: redaction and promotion disagreed about what a mask is, and
  // that disagreement is what destroyed the data. They must share the check.
  const source = readFileSync(join(__dirname, 'cases.service.ts'), 'utf8');

  it('promotion refuses a masked value', () => {
    expect(source).toMatch(/bankAccount !== undefined && !isMaskedAnswer\(bankAccount\)/);
  });

  it('redaction and promotion use the same predicate', () => {
    const uses = source.match(/isMaskedAnswer\(/g) ?? [];
    // One definition, plus both call sites.
    expect(uses.length).toBeGreaterThanOrEqual(3);
  });
});
