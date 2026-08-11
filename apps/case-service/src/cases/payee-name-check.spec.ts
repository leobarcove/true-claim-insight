import {
  checkPayeeName,
  comparePayeeName,
  CLAIMANT_NAME_STEP,
  PAYEE_NAME_STEP,
} from '@tci/shared-types';

/**
 * Is the person claiming the person being paid?
 *
 * Two halves, deliberately separated:
 *
 *  - `checkPayeeName` — the wiring. Reads both names out of the answers and
 *    decides whether the question is even askable. Implemented, tested here,
 *    and independent of whatever the comparison eventually does.
 *  - `comparePayeeName` — the rule. Currently a stub returning 'uncertain'.
 *    The suite below is skipped until it is written.
 *
 * The split matters because the wiring's job is to avoid crying wolf: a flow
 * that never asked for bank details must not surface as a discrepancy, or
 * adjusters learn to dismiss the warning before it ever means anything.
 */
describe('payee name check — wiring', () => {
  const answers = (claimant?: string, payee?: string) => ({
    ...(claimant !== undefined ? { [CLAIMANT_NAME_STEP]: claimant } : {}),
    ...(payee !== undefined ? { [PAYEE_NAME_STEP]: payee } : {}),
  });

  it('does not warn when the payout step was never reached', () => {
    const result = checkPayeeName(answers('Leo Boey'));

    expect(result.verdict).toBeNull();
    expect(result.shouldWarn).toBe(false);
    expect(result.payeeName).toBeNull();
  });

  it('does not warn when the claimant name is missing', () => {
    const result = checkPayeeName(answers(undefined, 'John Doe'));

    expect(result.verdict).toBeNull();
    expect(result.shouldWarn).toBe(false);
  });

  it('treats a blank or whitespace answer as absent, not as a mismatch', () => {
    expect(checkPayeeName(answers('Leo Boey', '   ')).verdict).toBeNull();
    expect(checkPayeeName(answers('', 'John Doe')).verdict).toBeNull();
  });

  it('survives absent answers entirely', () => {
    expect(checkPayeeName(undefined).shouldWarn).toBe(false);
    expect(checkPayeeName(null).shouldWarn).toBe(false);
    expect(checkPayeeName({}).shouldWarn).toBe(false);
  });

  it('ignores non-string answers rather than coercing them', () => {
    const result = checkPayeeName({
      [CLAIMANT_NAME_STEP]: 'Leo Boey',
      [PAYEE_NAME_STEP]: 12345 as unknown as string,
    });

    expect(result.verdict).toBeNull();
  });

  it('trims the names it reports back', () => {
    const result = checkPayeeName(answers('  Leo Boey  ', '  John Doe  '));

    expect(result.claimantName).toBe('Leo Boey');
    expect(result.payeeName).toBe('John Doe');
  });

  it('runs the comparison when both names are present', () => {
    const result = checkPayeeName(answers('Leo Boey', 'John Doe'));

    expect(result.verdict).not.toBeNull();
    expect(result.claimantName).toBe('Leo Boey');
    expect(result.payeeName).toBe('John Doe');
  });

  it('warns on anything that is not a clean match', () => {
    // While comparePayeeName is stubbed to 'uncertain' this holds trivially;
    // once it is implemented this asserts the real contract — only 'match'
    // silences the warning.
    const result = checkPayeeName(answers('Leo Boey', 'John Doe'));

    expect(result.shouldWarn).toBe(result.verdict !== 'match');
  });
});

/**
 * The rule itself.
 *
 * These are the cases that are not really arguable — if the rule disagrees with
 * any of them it is wrong, whatever approach was taken.
 */
describe('payee name check — comparison', () => {
  it('matches a name against itself', () => {
    expect(comparePayeeName('Leo Boey', 'Leo Boey')).toBe('match');
  });

  it('matches across case, as banks store names uppercase', () => {
    expect(comparePayeeName('Leo Boey', 'LEO BOEY')).toBe('match');
  });

  it('matches across incidental whitespace', () => {
    expect(comparePayeeName('Leo  Boey', 'Leo Boey')).toBe('match');
  });

  it('does not match two unrelated people', () => {
    // The case that prompted all this: CSE-2026-000024.
    expect(comparePayeeName('Leo Boey', 'John Doe')).toBe('mismatch');
  });

  it('does not match a shared surname alone', () => {
    expect(comparePayeeName('Siti binti Rahman', 'Amirul bin Rahman')).toBe('mismatch');
  });
});

/**
 * The contested cases, now decided.
 *
 * Each had a defensible answer either way. The principle applied throughout:
 * only `match` silences the warning, so `uncertain` is cheap — an adjuster
 * glances — while a wrong `match` waves through the shape of payout diversion
 * and a wrong `mismatch` teaches them to dismiss the badge. Where the two
 * names are mechanically the same and only the *rendering* differs, match.
 * Where the letters themselves differ, refer it.
 */
describe('payee name check — the decisions', () => {
  it('matches when the bank dropped the patronymic', () => {
    // Routine on both sides: banks drop `bin`, and so do claimants in a hurry.
    expect(comparePayeeName('Amirul bin Rahman', 'Amirul Rahman')).toBe('match');
  });

  it('matches a name the bank truncated mid-word', () => {
    // ~20-character field. Refusing this would warn on a large share of
    // ordinary Malaysian claims, which is how a warning stops being read.
    expect(comparePayeeName('Muhammad Amirul bin Rahman', 'MUHAMMAD AMIRUL BIN R')).toBe('match');
  });

  it('matches a name written in the other order', () => {
    // Every token is identical and only the order differs; which order a bank
    // holds is arbitrary, and Chinese and Indian names vary in both directions.
    expect(comparePayeeName('Leo Boey', 'Boey Leo')).toBe('match');
  });

  it('refers romanisation drift rather than guessing', () => {
    // "Chee"/"Chi" and "Keong"/"Kiong" are probably one person — but probably
    // is exactly what `uncertain` is for, and the surname alone is thin.
    expect(comparePayeeName('Wong Chee Keong', 'Wong Chi Kiong')).toBe('uncertain');
  });

  it('matches across an honorific on one side only', () => {
    expect(comparePayeeName("Dato' Lim Chee Keong", 'Lim Chee Keong')).toBe('match');
  });

  it('matches when a/p or a/l is dropped', () => {
    expect(comparePayeeName('Priya a/p Muthusamy', 'Priya Muthusamy')).toBe('match');
    expect(comparePayeeName('Kumaran a/l Muthusamy', 'KUMARAN MUTHUSAMY')).toBe('match');
  });

  it('matches across punctuation the bank did not keep', () => {
    expect(comparePayeeName("Nur'ain binti Yusof", 'NURAIN BINTI YUSOF')).toBe('match');
    // Hyphens separate rather than vanish — the name is written both ways.
    expect(comparePayeeName('Siti-Aminah Yusof', 'SITI AMINAH YUSOF')).toBe('match');
  });

  it('matches when a middle name is present on one side only', () => {
    expect(comparePayeeName('Muhammad Amirul Rahman', 'Amirul Rahman')).toBe('match');
  });

  it('never strips an honorific down to an empty name', () => {
    // The failure guarded against: "Dato" reduced to nothing, which would then
    // compare as an empty token list against every name on the book. The
    // stripper only runs when something is left behind, so this stays a real
    // token and reads as what it is — nothing in common with the payee.
    expect(comparePayeeName('Dato', 'Lim Chee Keong')).toBe('mismatch');
    // And the honorific is still stripped when a name follows it.
    expect(comparePayeeName("Dato' Lim", 'Lim')).toBe('match');
  });

  it('does not treat a short shared prefix as a truncation', () => {
    // The truncation rule is what makes "MUHAMMAD AMIRUL BIN R" work; it must
    // not also make a common surname enough on its own.
    expect(comparePayeeName('Lee', 'Lee Chong Wei')).toBe('uncertain');
  });

  it('still separates siblings when the bank truncated too', () => {
    // The case that makes rule 4 load-bearing: same father, same rendering
    // quirks, different people.
    expect(comparePayeeName('Siti binti Abdul Rahman', 'AMIRUL BIN ABDUL RAHMAN')).toBe('mismatch');
  });
});
