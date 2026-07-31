/**
 * CPD standing — PD 12.10's fifteen-hour annual floor, as pure decisions.
 *
 * Two honesty rules shape this:
 *  - Only *recognised* hours count toward the floor (12.11 sends the firm to
 *    the Association of Malaysian Loss Adjusters — that AMLA, not the Act — on
 *    what qualifies). Unrecognised attendance is recorded but is not the
 *    currency the floor is denominated in.
 *  - A year in progress cannot be "in breach". Mid-year the standing is a
 *    trajectory (on track / behind); only a *closed* year with a shortfall is a
 *    finding. Reporting February as fourteen hours short would train everyone
 *    to ignore the dashboard by March.
 */

export const CPD_ANNUAL_FLOOR_HOURS = 15;

export interface CpdEntry {
  year: number;
  hours: number;
  providerRecognised: boolean;
}

export type CpdVerdict = 'MET' | 'BEHIND' | 'ON_TRACK' | 'SHORTFALL';

export interface CpdStanding {
  year: number;
  hoursRecorded: number;
  hoursQualifying: number;
  floor: number;
  /** SHORTFALL only for a closed year; an open year is MET, ON_TRACK or BEHIND. */
  verdict: CpdVerdict;
}

/** Round to one decimal — hours are recorded in halves and quarters. */
const round = (value: number) => Math.round(value * 10) / 10;

export function cpdStanding(entries: CpdEntry[], year: number, now: Date): CpdStanding {
  const inYear = entries.filter(entry => entry.year === year);
  const hoursRecorded = round(inYear.reduce((sum, entry) => sum + entry.hours, 0));
  const hoursQualifying = round(
    inYear.filter(entry => entry.providerRecognised).reduce((sum, entry) => sum + entry.hours, 0)
  );

  const yearClosed = now.getUTCFullYear() > year;

  let verdict: CpdVerdict;
  if (hoursQualifying >= CPD_ANNUAL_FLOOR_HOURS) {
    verdict = 'MET';
  } else if (yearClosed) {
    verdict = 'SHORTFALL';
  } else {
    // Pro-rata expectation: by end of June, roughly half the floor. BEHIND is a
    // nudge, not a finding — the year can still be met.
    const yearStart = Date.UTC(year, 0, 1);
    const yearEnd = Date.UTC(year + 1, 0, 1);
    const elapsed = Math.min(1, Math.max(0, (now.getTime() - yearStart) / (yearEnd - yearStart)));
    verdict = hoursQualifying >= CPD_ANNUAL_FLOOR_HOURS * elapsed ? 'ON_TRACK' : 'BEHIND';
  }

  return { year, hoursRecorded, hoursQualifying, floor: CPD_ANNUAL_FLOOR_HOURS, verdict };
}

/**
 * The advisory text for an assignment when last year's floor was missed —
 * recorded, never blocking: the PD requires the firm to ensure attendance, not
 * to stop the adjuster working, and a blocked assignment would punish the claim.
 */
export function cpdAdvisory(standing: CpdStanding): string | null {
  if (standing.verdict !== 'SHORTFALL') return null;
  return (
    `CPD shortfall for ${standing.year}: ${standing.hoursQualifying} of ` +
    `${standing.floor} qualifying hours (PD 12.10)`
  );
}
