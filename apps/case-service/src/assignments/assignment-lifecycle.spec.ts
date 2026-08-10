import { AssignmentStatus } from '@prisma/client';
import {
  ASSIGNMENT_TRANSITIONS,
  TERMINAL_STATUSES,
  acknowledgementOutstanding,
  canOpenClaim,
  canTransition,
} from './assignment-lifecycle';

/**
 * COMPLIANCE TESTS — BNM CSP acknowledgement, one working day.
 *
 * The obligation runs from when the insurer's instruction arrived. Before
 * `Assignment` existed the journey began at `Claim` — that is, when the firm
 * decided to start work — so the deadline had nothing to be measured from and
 * could not be met or missed, only ignored.
 */
describe('Assignment lifecycle (CSP acknowledgement)', () => {
  describe('the acknowledgement obligation', () => {
    it('is outstanding only while the appointment is unanswered', () => {
      expect(acknowledgementOutstanding(AssignmentStatus.RECEIVED)).toBe(true);
    });

    it('is discharged by declining as surely as by acknowledging', () => {
      // Both answer the insurer. Leaving the clock running on a declined
      // appointment would manufacture a breach out of a matter the firm
      // correctly refused — a conflict of interest, say.
      expect(acknowledgementOutstanding(AssignmentStatus.ACKNOWLEDGED)).toBe(false);
      expect(acknowledgementOutstanding(AssignmentStatus.DECLINED)).toBe(false);
    });
  });

  describe('transitions', () => {
    it('allows an appointment to be declined without acknowledging first', () => {
      // A firm with a conflict or no capacity must be able to say so directly.
      expect(canTransition(AssignmentStatus.RECEIVED, AssignmentStatus.DECLINED)).toBe(true);
    });

    it('allows declining after acknowledging, since a conflict often surfaces later', () => {
      expect(canTransition(AssignmentStatus.ACKNOWLEDGED, AssignmentStatus.DECLINED)).toBe(true);
      expect(canTransition(AssignmentStatus.ACCEPTED, AssignmentStatus.DECLINED)).toBe(true);
    });

    it('does not allow acceptance before acknowledgement', () => {
      expect(canTransition(AssignmentStatus.RECEIVED, AssignmentStatus.ACCEPTED)).toBe(false);
    });

    it('does not allow a declined or completed appointment to move again', () => {
      expect(ASSIGNMENT_TRANSITIONS[AssignmentStatus.DECLINED]).toEqual([]);
      expect(ASSIGNMENT_TRANSITIONS[AssignmentStatus.COMPLETED]).toEqual([]);
      expect(TERMINAL_STATUSES.sort()).toEqual(['COMPLETED', 'DECLINED']);
    });

    it('reaches every status from the starting point', () => {
      // A status no path can reach is a status that will never be used, and an
      // unreachable DECLINED would mean refusals had nowhere to be recorded.
      const reachable = new Set<string>([AssignmentStatus.RECEIVED]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const status of [...reachable]) {
          for (const next of ASSIGNMENT_TRANSITIONS[status as AssignmentStatus] ?? []) {
            if (!reachable.has(next)) {
              reachable.add(next);
              grew = true;
            }
          }
        }
      }
      expect([...reachable].sort()).toEqual(
        Object.keys(ASSIGNMENT_TRANSITIONS).sort()
      );
    });
  });

  describe('opening a claim', () => {
    it('refuses before the appointment is acknowledged', () => {
      // Starting work on an instruction the firm has not answered is how the
      // acknowledgement gets forgotten; the CSP breach is then silent.
      const result = canOpenClaim(AssignmentStatus.RECEIVED);

      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/acknowledge/i);
      expect(result.reason).toMatch(/one working day/i);
    });

    it('allows it once acknowledged or accepted', () => {
      expect(canOpenClaim(AssignmentStatus.ACKNOWLEDGED).allowed).toBe(true);
      expect(canOpenClaim(AssignmentStatus.ACCEPTED).allowed).toBe(true);
    });

    it('refuses on a declined or completed appointment', () => {
      for (const status of [AssignmentStatus.DECLINED, AssignmentStatus.COMPLETED]) {
        expect(canOpenClaim(status).allowed).toBe(false);
      }
    });

    it('gives a reason whenever it refuses', () => {
      for (const status of Object.values(AssignmentStatus)) {
        const result = canOpenClaim(status);
        if (!result.allowed) expect(result.reason?.trim().length).toBeGreaterThan(10);
      }
    });
  });
});
