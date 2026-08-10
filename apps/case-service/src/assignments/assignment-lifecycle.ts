import { AssignmentStatus } from '@prisma/client';

/**
 * Assignment lifecycle rules, as pure decisions.
 *
 * The acknowledgement is the part with a regulator attached: BNM's Claims
 * Settlement Practices PD gives the firm one working day from receiving an
 * appointment to acknowledge it. Everything here exists so that obligation is
 * measured from the moment the instruction arrived rather than from whenever
 * someone got round to opening a claim.
 */

export const ASSIGNMENT_TRANSITIONS: Record<AssignmentStatus, AssignmentStatus[]> = {
  // An appointment may be acknowledged, or declined outright — a firm with a
  // conflict or no capacity must be able to say so without acknowledging first.
  [AssignmentStatus.RECEIVED]: [
    AssignmentStatus.ACKNOWLEDGED,
    AssignmentStatus.DECLINED,
  ],
  // Declining after acknowledging is legitimate: a conflict often surfaces only
  // once the parties are known.
  [AssignmentStatus.ACKNOWLEDGED]: [AssignmentStatus.ACCEPTED, AssignmentStatus.DECLINED],
  [AssignmentStatus.ACCEPTED]: [AssignmentStatus.COMPLETED, AssignmentStatus.DECLINED],
  [AssignmentStatus.DECLINED]: [],
  [AssignmentStatus.COMPLETED]: [],
};

export function canTransition(from: AssignmentStatus, to: AssignmentStatus): boolean {
  return (ASSIGNMENT_TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses from which no further movement is possible. */
export const TERMINAL_STATUSES = (Object.keys(ASSIGNMENT_TRANSITIONS) as AssignmentStatus[]).filter(
  status => ASSIGNMENT_TRANSITIONS[status].length === 0
);

/**
 * Is the acknowledgement still outstanding?
 *
 * Only RECEIVED counts. Declining discharges the obligation as surely as
 * acknowledging does — the insurer has been answered either way, and leaving the
 * clock running on a declined appointment would manufacture a breach out of a
 * matter the firm correctly refused.
 */
export function acknowledgementOutstanding(status: AssignmentStatus): boolean {
  return status === AssignmentStatus.RECEIVED;
}

/**
 * May a claim be opened for this assignment?
 *
 * Not before acknowledgement. Opening a claim is the firm starting work, and
 * starting work on an instruction it has not answered is how the acknowledgement
 * gets forgotten — the CSP breach that follows is silent until someone asks.
 */
export function canOpenClaim(status: AssignmentStatus): { allowed: boolean; reason?: string } {
  if (status === AssignmentStatus.ACKNOWLEDGED || status === AssignmentStatus.ACCEPTED) {
    return { allowed: true };
  }

  if (status === AssignmentStatus.RECEIVED) {
    return {
      allowed: false,
      reason:
        'Acknowledge the appointment before opening a claim. BNM CSP allows one working day ' +
        'to acknowledge, and starting work without doing so is how that deadline is missed.',
    };
  }

  return { allowed: false, reason: `Cannot open a claim on a ${status} assignment.` };
}
