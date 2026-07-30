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
  const walkPaths = (): { path: string[]; live: Set<SlaStage> }[] => {
    const results: { path: string[]; live: Set<SlaStage> }[] = [];

    const visit = (status: string, path: string[], live: Set<SlaStage>) => {
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

  it('flags any SLA transition keyed to a status the claim can never reach', () => {
    const reachable = new Set(
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
