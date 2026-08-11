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
 * Remove `.skip` once `comparePayeeName` is implemented. These are the cases
 * that are not really arguable — if the rule disagrees with any of them it is
 * wrong, whatever approach you took.
 */
describe.skip('payee name check — comparison', () => {
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
 * The contested cases — your call, not mine.
 *
 * Each of these has a defensible answer either way, and the right one depends
 * on how much adjuster time a false positive is worth against how much a missed
 * diversion costs. Write the assertion you want, then make it pass.
 */
describe('payee name check — decisions to make', () => {
  it.todo("patronymic dropped by the bank: 'Amirul bin Rahman' vs 'Amirul Rahman'");
  it.todo("bank field truncated at ~20 chars: 'Muhammad Amirul bin Rahman' vs 'MUHAMMAD AMIRUL BIN R'");
  it.todo("Chinese name order reversed: 'Leo Boey' vs 'Boey Leo'");
  it.todo("romanisation drift: 'Wong Chee Keong' vs 'Wong Chi Kiong'");
  it.todo("honorific on one side only: 'Dato' Lim Chee Keong' vs 'Lim Chee Keong'");
  it.todo("a/p and a/l dropped: 'Priya a/p Muthusamy' vs 'Priya Muthusamy'");
  it.todo("punctuation drift: \"Nur'ain binti Yusof\" vs 'NURAIN BINTI YUSOF'");
  it.todo('middle name present on one side only');
});
