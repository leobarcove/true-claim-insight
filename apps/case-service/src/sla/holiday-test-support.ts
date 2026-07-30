import { MALAYSIAN_HOLIDAYS, type Holiday } from './working-days';

/**
 * Install a verified holiday year for the duration of a test.
 *
 * The production holiday table ships unverified on purpose, and working-day
 * arithmetic refuses to run against an unverified year. Tests need to exercise
 * that arithmetic without depending on gazette data nobody has entered yet, so
 * they supply their own known-good year and restore the original afterwards.
 *
 * Not a `.spec.ts` file — it holds no tests, only the fixture both SLA suites
 * share, so the two cannot drift apart on what a verified year looks like.
 */
export function withVerifiedYear(year: number, holidays: Holiday[], run: () => void): void {
  const original = MALAYSIAN_HOLIDAYS[year];
  MALAYSIAN_HOLIDAYS[year] = { verifiedAgainstGazette: true, holidays };
  try {
    run();
  } finally {
    if (original) MALAYSIAN_HOLIDAYS[year] = original;
    else delete MALAYSIAN_HOLIDAYS[year];
  }
}

/** `YYYY-MM-DD` at UTC midnight — dates in these tests carry no time component. */
export const at = (isoDate: string): Date => new Date(`${isoDate}T00:00:00Z`);

/** The date part of a Date, for readable assertions. */
export const dateOf = (date: Date): string => date.toISOString().slice(0, 10);
