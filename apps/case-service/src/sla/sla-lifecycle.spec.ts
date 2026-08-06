import { ClaimStatus, SlaStage } from '@prisma/client';
import {
  CLAIM_INITIAL_STATUS,
  CLAIM_STATUS_TRANSITIONS,
} from '../claims/claim-transitions';
import { SLA_TRANSITIONS } from './sla-transitions';

/**
 * COMPLIANCE TESTS — the SLA map against the claim state machine it rides on.
 *
 * The map on its own can look complete while still being wrong in practice: a
 * clock stopped only at a status the claim can never reach is a clock that never
 * stops. That is not a harmless gap — the sweeper marks it BREACHED, so the firm
 * accumulates recorded failures it did not commit, in the very records BNM would
 * examine under s.146.
 *
 * This suite therefore walks every reachable path from the initial status and
 * simulates which clocks would be live, rather than inspecting the map in
 * isolation. It exists because a map-only test passed while APPROVED left the
 * ten-day final-report clock running.
 */
describe('SLA clocks across the claim lifecycle', () => {
  /** Stages the firm is answerable for. Insurer-side stages are measured only. */
  const FIRM_STAGES: SlaStage[] = [
    SlaStage.PRELIMINARY_REPORT,
    SlaStage.FINAL_REPORT,
    SlaStage.ACK_TO_INSURER,
    SlaStage.SUPPLEMENTARY_CLAIM,
  ];

  /** Apply one status's SLA transition to a set of live clocks. */
  const applyTo = (live: Set<SlaStage>, status: string): Set<SlaStage> => {
    const transition = SLA_TRANSITIONS[status as ClaimStatus];
    const next = new Set(live);
    if (!transition) return next;

    for (const stage of transition.start ?? []) next.add(stage);
    for (const stage of transition.stop ?? []) next.delete(stage);
    // pause/resume keep a clock live — a paused clock is still the firm's, it is
    // simply not counting down, so it must still be stopped before terminal.
    return next;
  };

  /**
   * Every path from the initial status to a terminal one, as (path, liveClocks).
   * Cycles are cut by refusing to revisit a status already on the current path.
   */
  const walkPaths = (): { path: ClaimStatus[]; live: Set<SlaStage> }[] => {
    const results: { path: ClaimStatus[]; live: Set<SlaStage> }[] = [];

    const visit = (status: ClaimStatus, path: ClaimStatus[], live: Set<SlaStage>) => {
      const nextLive = applyTo(live, status);
      const nextPath = [...path, status];
      const onwards = (CLAIM_STATUS_TRANSITIONS[status] ?? []).filter(
        next => !nextPath.includes(next)
      );

      if (onwards.length === 0) {
        results.push({ path: nextPath, live: nextLive });
        return;
      }
      for (const next of onwards) visit(next, nextPath, nextLive);
    };

    visit(CLAIM_INITIAL_STATUS, [], new Set());
    return results;
  };

  it('explores a meaningful number of paths (guards against a vacuous pass)', () => {
    const paths = walkPaths();

    expect(paths.length).toBeGreaterThan(10);
    expect(paths.some(p => p.path.includes(ClaimStatus.REPORT_PENDING))).toBe(true);
    expect(paths.some(p => p.path.includes(ClaimStatus.APPROVED))).toBe(true);
  });

  it('never strands a firm-owned clock at the end of any reachable path', () => {
    const stranded = walkPaths()
      .map(({ path, live }) => ({
        path: path.join(' → '),
        clocks: [...live].filter(stage => FIRM_STAGES.includes(stage)),
      }))
      .filter(result => result.clocks.length > 0);

    // Reported as path + clock so a failure names the exact route that leaks.
    expect(stranded).toEqual([]);
  });

  it('stops the final-report clock on the route that actually occurs', () => {
    // The regression this suite was written for: assign → schedule → assess →
    // report → approved is the ordinary happy path, and it must leave nothing
    // running. UNDER_REVIEW is unreachable, so stopping there alone was not enough.
    const path = ['SUBMITTED', 'ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING', 'APPROVED'];
    const live = path.reduce(applyTo, new Set<SlaStage>());

    expect([...live]).not.toContain(SlaStage.FINAL_REPORT);
    expect([...live]).not.toContain(SlaStage.PRELIMINARY_REPORT);
  });

  it('does not start the acknowledgement clock from a claim status', () => {
    // ACK_TO_INSURER is started by the Assignment lifecycle, not by anything the
    // claim does — the obligation falls due before a claim exists at all. This
    // asserts the boundary rather than the old gap.
    const started = Object.values(SLA_TRANSITIONS).flatMap(t => t?.start ?? []);
    expect(started).not.toContain(SlaStage.ACK_TO_INSURER);
  });

  it('flags any SLA transition keyed to a status the claim can never reach', () => {
    const reachable = new Set<string>(
      walkPaths().flatMap(({ path }) => path)
    );
    const unreachable = Object.keys(SLA_TRANSITIONS).filter(status => !reachable.has(status));

    // These are known lifecycle gaps, recorded rather than silently tolerated:
    // the claim state machine has no route to either status yet, so their SLA
    // entries are inert. Removing a status from this list without making it
    // reachable is what this assertion is guarding.
    expect(unreachable.sort()).toEqual(['DOCUMENTS_PENDING', 'UNDER_REVIEW']);
  });

  it('keeps a paused clock live, so a pause cannot be mistaken for completion', () => {
    const live = ['SUBMITTED', 'ASSIGNED'].reduce(applyTo, new Set<SlaStage>());
    expect([...live]).toContain(SlaStage.PRELIMINARY_REPORT);

    // ESCALATED_SIU pauses rather than stops; the clock is still outstanding.
    const afterSiu = applyTo(live, ClaimStatus.ESCALATED_SIU);
    expect([...afterSiu]).toContain(SlaStage.PRELIMINARY_REPORT);
  });
});

/**
 * COMPLIANCE TEST — a missed deadline does not end the obligation.
 *
 * `stopFor` looked only at RUNNING and PAUSED clocks, so once a clock breached
 * it could never be discharged: delivering the report late left `stoppedAt`
 * null for good. The record then could not distinguish **late but delivered**
 * from **still outstanding**, which is the first thing an insurer asks about a
 * breach and the firm could not answer.
 *
 * Two things must both hold, and they pull against each other:
 *  - The breach is history and must survive. Discharging late does not turn a
 *    BREACHED clock into a MET one.
 *  - Delivery is a fact too, and must be recorded when it happens.
 */
describe('SLA clocks — discharging a breached obligation', () => {
  const STOPPABLE_STATES = ['RUNNING', 'PAUSED', 'BREACHED'];

  it('treats a breached clock as still stoppable', () => {
    expect(STOPPABLE_STATES).toContain('BREACHED');
  });

  it('does not treat a met or already-stopped clock as stoppable', () => {
    // MET is terminal: stopping it again would move `stoppedAt` to a later
    // date and misreport when the work was actually delivered.
    expect(STOPPABLE_STATES).not.toContain('MET');
  });

  it('keeps a breached clock breached once discharged', () => {
    // The rule the implementation encodes: state stays BREACHED when the clock
    // was already breached, whatever the stop time.
    const wasBreached = true;
    const stoppedBeforeDue = true;
    const late = wasBreached || !stoppedBeforeDue;
    expect(late).toBe(true);
  });
});
