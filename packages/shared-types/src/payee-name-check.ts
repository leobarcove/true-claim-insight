/**
 * Does the person claiming match the person being paid?
 *
 * Intake asks two names for two different reasons: `claimant-name` is who the
 * claim belongs to (the name AMLA screening screens, and the name that must
 * match the IC or passport uploaded later), while `bank-account-holder` is
 * whoever the money actually lands with. Nothing in the flow requires them to
 * be the same, and until now nothing compared them.
 *
 * When they diverge it is usually innocent — a parent paying for a child's
 * trip, a spouse's joint account, a company card for a business trip. It is
 * also the exact shape of payout diversion, and of a claim filed under a
 * borrowed identity. Neither reading is safe to assume, so this never blocks:
 * it surfaces the divergence and leaves the judgement to the adjuster, in
 * keeping with the platform's standing position that rejection stays a human
 * decision (MASTER_PLAN §3.2).
 *
 * Deliberately a pure function over answers, with no Prisma and no I/O, so the
 * same rule can drive the adjuster portal's warning today and a conversion-time
 * gate in case-service later without the two drifting apart.
 */
import type { CaseAnswers } from './case-flows';

/**
 * The answer keys this check reads. Named here rather than inlined so that
 * renaming a step in `case-flows.ts` breaks a single obvious place.
 */
export const CLAIMANT_NAME_STEP = 'claimant-name';
export const PAYEE_NAME_STEP = 'bank-account-holder';

export type PayeeMatchVerdict =
  /** The two names denote the same person, allowing for spelling and format. */
  | 'match'
  /** They denote different people, so far as we can tell. */
  | 'mismatch'
  /**
   * Too close to call — worth an adjuster's eye but not worth asserting as a
   * discrepancy. Return this rather than guessing; a false "mismatch" on a
   * legitimate claim costs an adjuster real time.
   */
  | 'uncertain';

export interface PayeeNameCheck {
  /** `null` when the check could not run — see `checkPayeeName`. */
  verdict: PayeeMatchVerdict | null;
  /** The name as the claimant gave it, trimmed. */
  claimantName: string | null;
  /** The account holder name as the claimant gave it, trimmed. */
  payeeName: string | null;
  /**
   * True when both names were supplied and the verdict is anything other than
   * a clean match — i.e. when the adjuster should be shown something.
   */
  shouldWarn: boolean;
}

/**
 * Honorifics, stripped only from the *start* of a name.
 *
 * Position matters more than it looks. "Tan Sri" is an honorific; "Tan" is one
 * of the most common surnames in Malaysia, and a rule that removed it wherever
 * it appeared would quietly delete half the Chinese names on the book. Leading
 * position is where titles actually occur, so that is the only place this looks.
 */
const LEADING_HONORIFICS = [
  ['TAN', 'SRI'],
  ['PUAN', 'SRI'],
  ['DATUK', 'SERI'],
  ['DATO', 'SERI'],
  ['DATO'],
  ['DATIN'],
  ['DATUK'],
  ['TUAN'],
  ['PUAN'],
  ['ENCIK'],
  ['CIK'],
  ['MDM'],
  ['DR'],
  ['PROF'],
  ['HJ'],
  ['HAJI'],
  ['HAJJAH'],
  ['MR'],
  ['MRS'],
  ['MS'],
];

/**
 * Words joining a person to their parent, which carry no identity of their own.
 *
 * Banks drop them constantly and so do claimants in a hurry, so they are noise
 * on both sides of the comparison. The slashed forms are handled before
 * punctuation is stripped, because `a/l` becomes `AL` otherwise — and `Al` is a
 * real name particle.
 */
const CONNECTORS = new Set(['BIN', 'BINTI', 'BINTE', 'BT', 'BTE']);

/** Reduce a written name to comparable tokens. */
function normaliseName(name: string): string[] {
  let text = name.toUpperCase();

  // Before punctuation: a/l, a/p, s/o, d/o carry no identity.
  text = text.replace(/\b[APSD]\s*\/\s*[LPO]\b/g, ' ');

  // Hyphens separate ("Siti-Aminah" is written both ways); apostrophes and dots
  // do not ("Nur'ain" and "NURAIN" are one name, "Dato'" and "Dato" one title).
  text = text.replace(/[-–—]/g, ' ').replace(/['’`.,]/g, '');

  let tokens = text.split(/\s+/).filter(Boolean).filter(token => !CONNECTORS.has(token));

  // Leading honorific only, and never if it would leave nothing behind.
  for (const honorific of LEADING_HONORIFICS) {
    const matches = honorific.every((word, index) => tokens[index] === word);
    if (matches && tokens.length > honorific.length) {
      tokens = tokens.slice(honorific.length);
      break;
    }
  }

  return tokens;
}

/**
 * Shortest string a prefix match may rely on.
 *
 * Malaysian bank name fields commonly truncate around 20–25 characters, so
 * "MUHAMMAD AMIRUL BIN R" is an ordinary rendering of a real name rather than a
 * different one. Ten characters is short enough to catch that and long enough
 * that "LEE" against "LEE CHONG WEI" is not treated as the same person.
 */
const MIN_PREFIX_MATCH = 10;

/**
 * Are these two written names the same person?
 *
 * Three answers, and the middle one earns its place: `uncertain` is what stops
 * the rule having to force a borderline pair into a verdict it cannot support.
 * Only `match` silences the warning, so being unsure costs an adjuster a glance,
 * while being confidently wrong in either direction costs more — a false
 * `mismatch` wastes their time on an ordinary family arrangement, and a false
 * `match` waves through the exact shape of payout diversion.
 *
 * The rules, in order:
 *
 * 1. **Same token set → match.** Order-insensitive, because "Leo Boey" and
 *    "Boey Leo" are one person and which order a bank holds is arbitrary.
 * 2. **One is a truncation of the other → match.** See `MIN_PREFIX_MATCH`.
 * 3. **Every token of the shorter name appears in the longer → match**, when
 *    the shorter has at least two tokens. Dropped middle names are routine;
 *    a single shared token is not evidence of anything.
 * 4. **Neither given name appears anywhere in the other → mismatch.** This is
 *    the rule that separates siblings from one person: "Siti binti Rahman" and
 *    "Amirul bin Rahman" share a father, not an identity. A given name is the
 *    part that essentially always survives, whatever else the bank did to it.
 * 5. **Anything else → uncertain.** Partial overlap, romanisation drift, a
 *    shared surname with a different spelling of the given name.
 */
export function comparePayeeName(claimantName: string, payeeName: string): PayeeMatchVerdict {
  const left = normaliseName(claimantName);
  const right = normaliseName(payeeName);

  // Nothing survived normalisation on one side — a name made only of a title,
  // or of punctuation. Not something to assert a verdict about.
  if (left.length === 0 || right.length === 0) return 'uncertain';

  const leftSet = new Set(left);
  const rightSet = new Set(right);

  // 1. Same tokens, any order.
  if (leftSet.size === rightSet.size && [...leftSet].every(token => rightSet.has(token))) {
    return 'match';
  }

  // 2. Truncation.
  const leftJoined = left.join(' ');
  const rightJoined = right.join(' ');
  const [shorterJoined, longerJoined] =
    leftJoined.length <= rightJoined.length
      ? [leftJoined, rightJoined]
      : [rightJoined, leftJoined];
  if (shorterJoined.length >= MIN_PREFIX_MATCH && longerJoined.startsWith(shorterJoined)) {
    return 'match';
  }

  // 3. The shorter name is wholly contained in the longer.
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  const longerSet = new Set(longer);
  if (shorter.length >= 2 && shorter.every(token => longerSet.has(token))) {
    return 'match';
  }

  // 4. Neither given name appears in the other name at all.
  const leftGiven = left[0];
  const rightGiven = right[0];
  if (!rightSet.has(leftGiven) && !leftSet.has(rightGiven)) {
    return 'mismatch';
  }

  // 5. Something is shared, but not enough.
  return 'uncertain';
}

/**
 * Read both names out of a case's answers and compare them.
 *
 * Returns a `null` verdict — not a mismatch — when either name is absent or
 * blank. A flow that never asked for bank details (or a claimant who has not
 * reached that step) is not a discrepancy, and warning about one would train
 * adjusters to ignore the badge on the cases that matter.
 */
export function checkPayeeName(answers: CaseAnswers | null | undefined): PayeeNameCheck {
  const claimantName = readName(answers, CLAIMANT_NAME_STEP);
  const payeeName = readName(answers, PAYEE_NAME_STEP);

  if (!claimantName || !payeeName) {
    return { verdict: null, claimantName, payeeName, shouldWarn: false };
  }

  const verdict = comparePayeeName(claimantName, payeeName);

  return {
    verdict,
    claimantName,
    payeeName,
    shouldWarn: verdict !== 'match',
  };
}

/** Answers are loosely typed JSON, so anything non-string is treated as absent. */
function readName(answers: CaseAnswers | null | undefined, key: string): string | null {
  const value = answers?.[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
