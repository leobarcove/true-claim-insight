import { CASE_FLOWS, pathSteps } from '@tci/shared-types';

/**
 * COMPLIANCE-ADJACENT TEST — the claim an adjuster reads must match the claim
 * the claimant actually made.
 *
 * Editing a branch input rewrites the path retroactively. Switching a
 * cancellation reason from illness to a natural disaster leaves the medical
 * report attached to a claim that no longer asks for one, so an adjuster opens
 * the file and finds evidence contradicting it. `pathSteps` is how the service
 * knows which steps the current answers actually reach, so those documents can
 * be retired — superseded, never deleted, because what was submitted and when
 * is the record PD 12.8 exists to keep.
 */
describe('pathSteps follows the branch the answers select', () => {
  const flow = CASE_FLOWS.TRIP_CANCELLATION;

  it('includes the medical report when the reason is illness', () => {
    expect(pathSteps(flow, { 'cancellation-reason': 'ILLNESS' }).has('doc-medical-report')).toBe(
      true
    );
  });

  it('excludes it when the reason is something else', () => {
    expect(
      pathSteps(flow, { 'cancellation-reason': 'NATURAL_DISASTER' }).has('doc-medical-report')
    ).toBe(false);
  });

  it('always reaches the review, whichever branch is taken', () => {
    for (const reason of ['ILLNESS', 'NATURAL_DISASTER', 'OTHER']) {
      expect(pathSteps(flow, { 'cancellation-reason': reason }).has('review')).toBe(true);
    }
  });

  it('terminates on a flow whose branch points backwards', () => {
    // The walker refuses to revisit a step, so a miswired flow ends the walk
    // rather than hanging the request that triggered it.
    const cyclic = {
      travelClaimType: 'TRIP_CANCELLATION' as never,
      entryStepId: 'a',
      steps: [
        { id: 'a', prompt: '', label: '', answerType: 'text' as const, next: { type: 'step' as const, stepId: 'b' } },
        { id: 'b', prompt: '', label: '', answerType: 'text' as const, next: { type: 'step' as const, stepId: 'a' } },
      ],
    };
    expect([...pathSteps(cyclic, {})].sort()).toEqual(['a', 'b']);
  });
});

describe('every built-in flow marks exactly one review', () => {
  it.each(Object.entries(CASE_FLOWS))('%s', (_name, flow) => {
    // `isReview` decides whether answering submits the claim. A flow with none
    // could never be submitted; one with two could submit early.
    expect(flow.steps.filter(step => step.isReview)).toHaveLength(1);
  });

  it('medical has two confirm steps but only one review', () => {
    // The case that made the distinction necessary.
    const medical = CASE_FLOWS.MEDICAL;
    expect(medical.steps.filter(s => s.answerType === 'confirm')).toHaveLength(2);
    expect(medical.steps.filter(s => s.isReview)).toHaveLength(1);
  });
});
