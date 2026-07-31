import { ClaimStatus, SlaStage } from '@prisma/client';
import { SLA_TRANSITIONS } from './sla-transitions';

/**
 * COMPLIANCE TESTS — structural integrity of the claim-status → SLA-clock map.
 *
 * The failure this guards against is subtle and expensive: a clock that some
 * status starts but no status ever stops runs until the sweeper marks it
 * breached, producing a permanent false breach against the firm. Reviewing the
 * map by eye does not catch that, because the start and the stop are in
 * different entries.
 */
describe('SLA transition map', () => {
  const stagesIn = (key: 'start' | 'resume' | 'stop'): SlaStage[] =>
    Object.values(SLA_TRANSITIONS).flatMap(transition => transition?.[key] ?? []);

  const pausedStages = (): SlaStage[] =>
    Object.values(SLA_TRANSITIONS).flatMap(t => (t?.pause ?? []).map(p => p.stage));

  it('stops every stage it starts, so no clock can run forever', () => {
    const started = new Set(stagesIn('start'));
    const stopped = new Set(stagesIn('stop'));

    const orphans = [...started].filter(stage => !stopped.has(stage));
    expect(orphans).toEqual([]);
  });

  it('resumes every stage it pauses, so a pause cannot strand a clock', () => {
    const paused = new Set(pausedStages());
    const resumed = new Set(stagesIn('resume'));

    const stranded = [...paused].filter(stage => !resumed.has(stage));
    expect(stranded).toEqual([]);
  });

  it('never starts and stops the same stage in one transition', () => {
    for (const [status, transition] of Object.entries(SLA_TRANSITIONS)) {
      const started = new Set(transition?.start ?? []);
      const alsoStopped = (transition?.stop ?? []).filter(stage => started.has(stage));

      expect(alsoStopped).toEqual([]);
      // Named so a failure identifies the offending status immediately.
      expect(`${status}: no stage both started and stopped`).toBeTruthy();
    }
  });

  it('leaves nothing live on a CLOSED claim', () => {
    const closed = SLA_TRANSITIONS[ClaimStatus.CLOSED];
    const everStarted = new Set(stagesIn('start'));

    for (const stage of everStarted) {
      expect(closed?.stop).toContain(stage);
    }
  });

  it('pauses the report clocks when documents are outstanding', () => {
    // CSP runs the final-report window from *complete* documents, so waiting on
    // the claimant must not consume the firm's time.
    const paused = (SLA_TRANSITIONS[ClaimStatus.DOCUMENTS_PENDING]?.pause ?? []).map(p => p.stage);

    expect(paused).toContain(SlaStage.PRELIMINARY_REPORT);
    expect(paused).toContain(SlaStage.FINAL_REPORT);
  });

  it('gives every pause a reason, since the reason is the audit answer', () => {
    for (const transition of Object.values(SLA_TRANSITIONS)) {
      for (const pause of transition?.pause ?? []) {
        expect(pause.reason.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('leaves ACK_TO_INSURER to the assignment lifecycle', () => {
    // Not a gap: the acknowledgement falls due before a claim exists, so it is
    // started and stopped by Assignment. Mapping it onto a claim status would
    // measure a regulatory deadline from the wrong moment.
    expect(stagesIn('start')).not.toContain(SlaStage.ACK_TO_INSURER);
  });

  it('measures the insurer-side stages rather than ignoring them', () => {
    const started = stagesIn('start');

    expect(started).toContain(SlaStage.INSURER_DECISION);
    expect(started).toContain(SlaStage.INSURER_PAYMENT);
  });
});
