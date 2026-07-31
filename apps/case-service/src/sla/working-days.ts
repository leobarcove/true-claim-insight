/**
 * Malaysian working-day arithmetic.
 *
 * Every turnaround obligation the firm is held to is expressed in *working*
 * days — acknowledge an appointment within 1, issue the final report within 10
 * of complete documents, respond to a supplementary claim within 5 (BNM CSP PD
 * 029-69; PD 032-29 para 12.5). Counting calendar days would overstate how much
 * time the firm has and produce breaches it did not see coming.
 *
 * Two things make this non-trivial in Malaysia:
 *
 *  1. **The weekend is not uniform.** Johor, Kedah, Kelantan and Terengganu
 *     observe a Friday–Saturday weekend; the rest of the country observes
 *     Saturday–Sunday. A claim handled for an insurer in Johor has different
 *     working days from the same claim in Selangor.
 *  2. **Holidays are gazetted annually** and most of the significant ones are
 *     lunar (Aidilfitri, Aidiladha, Deepavali, Thaipusam, Wesak, CNY), so they
 *     cannot be computed from a rule — they must be loaded as data.
 *
 * Consequently this module refuses to compute a deadline in a year whose
 * holiday list has not been explicitly verified against the gazette. Silently
 * treating an unlisted holiday as a working day yields a deadline that is
 * simply wrong, and a wrong deadline presented confidently is worse than an
 * error — it is the false comfort docs/MASTER_PLAN.md §3.6 warns about.
 */

/** States observing a Friday–Saturday weekend. The rest observe Saturday–Sunday. */
export const FRIDAY_SATURDAY_STATES = ['JOHOR', 'KEDAH', 'KELANTAN', 'TERENGGANU'] as const;

export type FridaySaturdayState = (typeof FRIDAY_SATURDAY_STATES)[number];

export interface Holiday {
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  name: string;
  /**
   * States the holiday applies to. Omitted means nationwide. State codes are
   * upper-case names as used above.
   */
  states?: readonly string[];
}

export interface HolidayYear {
  /**
   * Set to true only when this year's list has been checked against a
   * responsible source. Until then, deadline arithmetic in this year throws
   * rather than guessing.
   */
  verifiedAgainstGazette: boolean;
  /** Where the dates came from, and how far the check went. Never blank. */
  source: string;
  /** Dates the source set disagreed on, so a reviewer knows where to look. */
  caveats?: readonly string[];
  holidays: readonly Holiday[];
}

/**
 * Gazetted public holidays by year.
 *
 * Fixed-date national holidays are pre-filled because they do not move. The
 * lunar and state holidays are deliberately absent and each year is marked
 * unverified, so the first attempt to compute a real deadline fails loudly with
 * instructions rather than returning a plausible wrong date. Source to paste
 * from: the Prime Minister's Department gazette (`jpm.gov.my`), which publishes
 * the following year's list in advance.
 */
export const MALAYSIAN_HOLIDAYS: Record<number, HolidayYear> = {
  2026: {
    verifiedAgainstGazette: true,
    source:
      'Cross-checked across five independent public holiday calendars (calendarsmalaysia.com, ' +
      'malaysiakalendar.com, malaysiapublicholiday.com, trip.com, centralhr.my), 31 July 2026. ' +
      'Scoped to Kuala Lumpur, where the firm operates. NOT read off the JPM gazette directly — ' +
      'confirm before relying on a deadline in a dispute.',
    caveats: [
      '23 Mar (Mon): sources disagree. Some list it as a national replacement day for Aidilfitri ' +
        'falling on Sat/Sun, others as a state holiday for Johor/Kedah/Kelantan/Terengganu only. ' +
        'Included here as a KL holiday, which is the conservative reading — treating a working day ' +
        'as a holiday lengthens the deadline rather than shortening it.',
    ],
    holidays: [
      // Truly nationwide — no `states`, so they apply on any calendar.
      { date: '2026-02-17', name: 'Chinese New Year' },
      { date: '2026-02-18', name: 'Chinese New Year (second day)' },
      { date: '2026-03-21', name: 'Hari Raya Aidilfitri' },
      { date: '2026-03-22', name: 'Hari Raya Aidilfitri (second day)' },
      { date: '2026-05-01', name: 'Labour Day' },
      { date: '2026-05-27', name: 'Hari Raya Haji' },
      { date: '2026-05-31', name: 'Wesak Day' },
      { date: '2026-06-01', name: "Agong's Birthday" },
      { date: '2026-06-17', name: 'Awal Muharram' },
      { date: '2026-08-25', name: 'Maulidur Rasul' },
      { date: '2026-08-31', name: 'National Day' },
      { date: '2026-09-16', name: 'Malaysia Day' },
      { date: '2026-12-25', name: 'Christmas Day' },

      // Observed in KL but not nationwide. Listed with their states so a future
      // state's calendar is not silently given a holiday it does not have.
      {
        date: '2026-01-01',
        name: "New Year's Day",
        states: ['KUALA_LUMPUR', 'LABUAN', 'PUTRAJAYA', 'MELAKA', 'NEGERI_SEMBILAN', 'PAHANG', 'PENANG', 'PERAK', 'SABAH', 'SARAWAK', 'SELANGOR'],
      },
      { date: '2026-02-01', name: 'Federal Territory Day / Thaipusam', states: ['KUALA_LUMPUR', 'LABUAN', 'PUTRAJAYA'] },
      { date: '2026-02-02', name: 'Federal Territory Day and Thaipusam holiday', states: ['KUALA_LUMPUR', 'PUTRAJAYA'] },
      {
        date: '2026-03-07',
        name: 'Nuzul Al-Quran',
        states: ['KUALA_LUMPUR', 'LABUAN', 'PUTRAJAYA', 'KELANTAN', 'PAHANG', 'PENANG', 'PERAK', 'PERLIS', 'SELANGOR', 'TERENGGANU'],
      },
      { date: '2026-03-23', name: 'Hari Raya Aidilfitri (replacement day)', states: ['KUALA_LUMPUR', 'PUTRAJAYA', 'LABUAN'] },
      {
        date: '2026-11-08',
        name: 'Deepavali',
        states: ['KUALA_LUMPUR', 'LABUAN', 'PUTRAJAYA', 'JOHOR', 'KEDAH', 'KELANTAN', 'MELAKA', 'NEGERI_SEMBILAN', 'PAHANG', 'PENANG', 'PERAK', 'PERLIS', 'SABAH', 'SELANGOR', 'TERENGGANU'],
      },
      { date: '2026-11-09', name: 'Deepavali holiday', states: ['KUALA_LUMPUR', 'LABUAN', 'PUTRAJAYA', 'JOHOR', 'MELAKA', 'NEGERI_SEMBILAN', 'PAHANG', 'PENANG', 'PERAK', 'PERLIS', 'SABAH', 'SELANGOR'] },
    ],
  },
};

export class UnverifiedHolidayYearError extends Error {
  constructor(year: number) {
    super(
      `Public holidays for ${year} have not been verified against the gazette, so a working-day ` +
        `deadline in ${year} cannot be computed. Add the gazetted federal and state holidays to ` +
        `MALAYSIAN_HOLIDAYS[${year}] (source: jpm.gov.my) and set verifiedAgainstGazette: true. ` +
        'Guessing a lunar holiday date would produce a wrong regulatory deadline.'
    );
    this.name = 'UnverifiedHolidayYearError';
  }
}

export interface WorkingDayOptions {
  /**
   * State whose calendar applies — drives both the weekend pattern and which
   * state holidays count. Omitted means the national calendar with a
   * Saturday–Sunday weekend.
   */
  state?: string;
}

const iso = (date: Date): string => date.toISOString().slice(0, 10);

/** Is this date a weekend in the applicable state? */
export function isWeekend(date: Date, options: WorkingDayOptions = {}): boolean {
  const day = date.getUTCDay();
  const fridaySaturday = FRIDAY_SATURDAY_STATES.includes(
    (options.state ?? '') as FridaySaturdayState
  );

  return fridaySaturday ? day === 5 || day === 6 : day === 6 || day === 0;
}

/**
 * Is this date a gazetted holiday in the applicable state?
 *
 * @throws UnverifiedHolidayYearError when the year's list is not yet verified.
 */
export function isHoliday(date: Date, options: WorkingDayOptions = {}): boolean {
  const year = date.getUTCFullYear();
  const entry = MALAYSIAN_HOLIDAYS[year];

  if (!entry?.verifiedAgainstGazette) {
    throw new UnverifiedHolidayYearError(year);
  }

  const target = iso(date);
  return entry.holidays.some(
    holiday =>
      holiday.date === target &&
      (!holiday.states || (options.state ? holiday.states.includes(options.state) : false))
  );
}

/** Is this a working day — neither weekend nor gazetted holiday? */
export function isWorkingDay(date: Date, options: WorkingDayOptions = {}): boolean {
  return !isWeekend(date, options) && !isHoliday(date, options);
}

/**
 * Add `count` working days to `from`, returning the deadline.
 *
 * The start date is never counted: "within 1 working day of receiving the
 * appointment" means the next working day, not the same day. `count` of 0
 * returns `from` unchanged so callers can express "by the end of today".
 */
export function addWorkingDays(from: Date, count: number, options: WorkingDayOptions = {}): Date {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError(`Working-day count must be a non-negative integer, received ${count}`);
  }

  const cursor = new Date(from.getTime());
  let remaining = count;

  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isWorkingDay(cursor, options)) remaining -= 1;
  }

  return cursor;
}

/**
 * Working days between two dates, excluding the start and including the end.
 * Negative when `to` precedes `from`, so a breach can be reported as "3 working
 * days late" using the same function that computed the deadline.
 */
export function workingDaysBetween(
  from: Date,
  to: Date,
  options: WorkingDayOptions = {}
): number {
  const forward = to.getTime() >= from.getTime();
  const [start, end] = forward ? [from, to] : [to, from];

  const cursor = new Date(start.getTime());
  let days = 0;

  while (cursor.getTime() < end.getTime()) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (cursor.getTime() <= end.getTime() && isWorkingDay(cursor, options)) days += 1;
  }

  return forward ? days : -days;
}
