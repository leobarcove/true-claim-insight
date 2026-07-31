import { addWorkingDays, workingDaysBetween, type WorkingDayOptions } from './working-days';

/**
 * The arithmetic behind every SLA clock, kept free of Prisma and NestJS.
 *
 * Separated deliberately: these are the functions that decide whether the firm
 * met a BNM turnaround obligation, so they need to be testable exhaustively in
 * CI without a database (docs/MASTER_PLAN.md §4.3 A4).
 */

export interface SlaTarget {
  workingDays: number;
  warnWorkingDaysBefore: number;
  /** Malaysian state whose calendar applies; null uses the national one. */
  calendarState?: string | null;
}

const calendarOf = (target: SlaTarget): WorkingDayOptions =>
  target.calendarState ? { state: target.calendarState } : {};

/** Deadline for a clock started at `startedAt`. */
export function dueDateFor(startedAt: Date, target: SlaTarget): Date {
  return addWorkingDays(startedAt, target.workingDays, calendarOf(target));
}

/**
 * Working days left before the deadline, as at `now`.
 *
 * Negative once the deadline has passed, so the same number expresses "2 days
 * left" and "2 working days late" — a breach report should not need different
 * arithmetic from the countdown that preceded it.
 */
export function remainingWorkingDays(now: Date, dueAt: Date, target: SlaTarget): number {
  return workingDaysBetween(now, dueAt, calendarOf(target));
}

/**
 * Deadline after resuming a paused clock.
 *
 * The remaining working days are carried across the pause rather than the
 * original deadline being kept: time spent waiting for the claimant's documents
 * is not time the firm was given to work. CSP's final-report window runs from
 * *complete* documents, so a pause that silently consumed the deadline would
 * manufacture breaches the firm is not answerable for.
 */
export function dueDateAfterResume(
  resumedAt: Date,
  remainingAtPause: number,
  target: SlaTarget
): Date {
  return addWorkingDays(resumedAt, Math.max(0, remainingAtPause), calendarOf(target));
}

/**
 * Should a due-soon warning fire now?
 *
 * Suppressed when the target is no longer than the warning window: a
 * one-working-day acknowledgement cannot be warned about a day in advance, and
 * firing at the moment of creation would be noise, not a warning.
 */
export function shouldWarn(
  now: Date,
  dueAt: Date,
  target: SlaTarget,
  alreadyWarned: boolean
): boolean {
  if (alreadyWarned) return false;
  if (target.workingDays <= target.warnWorkingDaysBefore) return false;

  const remaining = remainingWorkingDays(now, dueAt, target);
  return remaining >= 0 && remaining <= target.warnWorkingDaysBefore;
}

/** Has the deadline passed? Exactly at the deadline is not yet a breach. */
export function isBreached(now: Date, dueAt: Date): boolean {
  return now.getTime() > dueAt.getTime();
}

/**
 * Escalation step for a breach that is `workingDaysLate` days old.
 *
 * Deliberately coarse — 1 on breach, 2 after two working days, 3 after five —
 * because escalation exists to get a human's attention, and a level that
 * changes daily trains people to ignore it. Level 3 is where PD 11.2(d) Board
 * escalation attaches — the sweep raises a `ComplianceEvent` at this level.
 */
export function escalationLevelFor(workingDaysLate: number): number {
  if (workingDaysLate >= 5) return 3;
  if (workingDaysLate >= 2) return 2;
  return 1;
}
