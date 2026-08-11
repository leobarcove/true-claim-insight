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
 * ─────────────────────────────────────────────────────────────────────────
 * TODO(you): implement the comparison.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Both arguments are guaranteed non-empty and already trimmed — `checkPayeeName`
 * handles the missing and blank cases before calling this, so you only have to
 * decide what "the same person" means.
 *
 * What makes this genuinely hard, and why it is your call rather than mine:
 *
 *  - **Patronymics.** "Amirul bin Rahman" and "Amirul Rahman" are the same
 *    person; banks frequently drop `bin` / `binti` / `a/l` / `a/p`. So do
 *    claimants typing in a hurry.
 *  - **Bank field truncation.** Malaysian bank account names are commonly
 *    capped around 20–25 characters, so "Muhammad Amirul bin Rahman" arrives
 *    as "MUHAMMAD AMIRUL BIN R". A prefix match may matter more than a whole
 *    string match.
 *  - **Case and punctuation.** Bank records are usually uppercase, and
 *    apostrophes and hyphens ("Nur'ain", "Siti-Aminah") survive inconsistently.
 *  - **Chinese name order.** "Leo Boey" and "Boey Leo" may be one person;
 *    romanisation varies too ("Wong Chee Keong" / "Wong Chi Kiong").
 *  - **Honorifics.** "Dato'", "Dr", "Hj" appear on one side and not the other.
 *  - **Genuinely different people.** "Leo Boey" vs "John Doe" — nothing shared,
 *    and the case that started all this.
 *
 * The design choice underneath: how much divergence you tolerate before calling
 * it a mismatch. Lean strict and adjusters drown in false positives on ordinary
 * Malaysian names, learn to dismiss the warning, and miss the real one. Lean
 * loose and it catches nothing worth catching. `'uncertain'` exists so you do
 * not have to force borderline pairs into either bucket.
 *
 * Returning `'uncertain'` for everything is a valid first cut — the wiring,
 * the UI and the tests all work, and the warning simply reads as "check this"
 * until you sharpen it.
 */
export function comparePayeeName(
  claimantName: string,
  payeeName: string,
): PayeeMatchVerdict {
  // Placeholder: every pair is referred to the adjuster. This deliberately does
  // not throw — the portal calls it on every case view, and an unimplemented
  // rule should not be able to take the case page down. The cost of the stub is
  // noise (a warning on matching names too), never a missed discrepancy.
  void claimantName;
  void payeeName;

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
