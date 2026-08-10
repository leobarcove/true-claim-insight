import { CSP_ADJUSTING_WORKING_DAYS, CSP_SUPPLEMENTARY_WORKING_DAYS } from '@tci/shared-types';

/**
 * COMPLIANCE TEST — the CSP turnaround ceilings (BNM/RH/PD 029-69, 1 July 2024).
 *
 * A tripwire, not arithmetic. These are numbers taken from a policy document,
 * and the failure they guard against is someone changing one because a screen
 * or a target looked wrong, rather than because BNM reissued the PD. If this
 * test fails, the correct response is to re-read paragraph 10.13 and update the
 * citation alongside the value — never to update the expectation alone.
 *
 * The platform ran 10 working days on a non-motor book for three weeks: not a
 * breach, since it is stricter than the ceiling, but it meant a breach report
 * could not tell "we missed our own promise" from "we missed the regulation".
 */
describe('CSP turnaround ceilings — para 10.13', () => {
  it('allows 14 working days for non-motor adjusting work', () => {
    expect(CSP_ADJUSTING_WORKING_DAYS.NON_MOTOR).toBe(14);
  });

  it('allows 10 working days for motor', () => {
    // Recorded though out of scope (MASTER_PLAN §1): if motor ever returns, the
    // ceiling is tighter, and a single platform-wide figure would be wrong.
    expect(CSP_ADJUSTING_WORKING_DAYS.MOTOR).toBe(10);
  });

  it('keeps motor tighter than non-motor', () => {
    expect(CSP_ADJUSTING_WORKING_DAYS.MOTOR).toBeLessThan(
      CSP_ADJUSTING_WORKING_DAYS.NON_MOTOR
    );
  });

  it('allows 5 working days to respond to a supplementary claim', () => {
    expect(CSP_SUPPLEMENTARY_WORKING_DAYS).toBe(5);
  });
});
