import {
  CASE_FLOWS,
  REVIEW_STEP_ID,
  restoreReviewFlag,
  validateFlowDefinition,
  type CaseFlow,
} from '@tci/shared-types';

/**
 * The review step is the only step whose answer *submits the claim*, and it is
 * identified by a flag rather than by shape. That makes it quietly losable in
 * two directions, both of which have happened:
 *
 *  - dropped from a stored definition, so nothing submits and the claimant
 *    confirms a summary that was never attached to the message;
 *  - inferred from `answerType === 'confirm'`, which picks the medical flow's
 *    mid-conversation notice and files the claim before it is finished.
 *
 * These tests hold both ends: the built-in flows declare exactly one, and a
 * definition that lost the flag in storage is repaired on the way back in.
 */
describe('review step', () => {
  const flows = Object.entries(CASE_FLOWS) as Array<[string, CaseFlow]>;

  it('has flows to check', () => {
    expect(flows.length).toBeGreaterThan(0);
  });

  describe.each(flows)('%s', (_type, flow) => {
    it('declares exactly one review step', () => {
      const reviews = flow.steps.filter(step => step.isReview);
      expect(reviews.map(step => step.id)).toEqual([REVIEW_STEP_ID]);
    });

    it('puts the review last, so nothing is asked after the claim is filed', () => {
      const review = flow.steps.find(step => step.isReview);
      expect(review?.next).toEqual({ type: 'end' });
    });
  });

  describe('restoreReviewFlag', () => {
    const stripped = (flow: CaseFlow): CaseFlow => ({
      ...flow,
      steps: flow.steps.map(({ isReview: _dropped, ...step }) => step),
    });

    it('puts the flag back on a definition published before it existed', () => {
      const flow = CASE_FLOWS.FLIGHT_DELAY;
      const before = stripped(flow);
      expect(before.steps.some(step => step.isReview)).toBe(false);

      const after = restoreReviewFlag(before, flow);
      expect(after.steps.filter(step => step.isReview).map(step => step.id)).toEqual([
        REVIEW_STEP_ID,
      ]);
    });

    it('repairs by id even with no reference to compare against', () => {
      const after = restoreReviewFlag(stripped(CASE_FLOWS.MEDICAL));
      expect(after.steps.filter(step => step.isReview).map(step => step.id)).toEqual([
        REVIEW_STEP_ID,
      ]);
    });

    it('does not mistake the medical flow’s mid-flow notice for the review', () => {
      const flow = CASE_FLOWS.MEDICAL;
      const confirms = flow.steps.filter(step => step.answerType === 'confirm');
      // Guards the premise: if this flow ever stops having two confirm steps,
      // this test stops proving anything and should be pointed at one that does.
      expect(confirms.length).toBeGreaterThan(1);

      const after = restoreReviewFlag(stripped(flow), flow);
      const flagged = after.steps.filter(step => step.isReview);
      expect(flagged).toHaveLength(1);
      expect(flagged[0].id).toBe(REVIEW_STEP_ID);
    });

    it('leaves a definition that already carries the flag untouched', () => {
      const flow = CASE_FLOWS.LUGGAGE_LOSS;
      expect(restoreReviewFlag(flow, flow)).toBe(flow);
    });
  });

  describe('publish gate', () => {
    it('refuses a flow with no review step', () => {
      const flow = CASE_FLOWS.FLIGHT_DELAY;
      const problems = validateFlowDefinition(
        { ...flow, steps: flow.steps.map(({ isReview: _dropped, ...step }) => step) },
        flow
      );
      expect(problems.map(problem => problem.kind)).toContain('review-step');
    });

    it('refuses a flow with two, either of which would file the claim', () => {
      const flow = CASE_FLOWS.FLIGHT_DELAY;
      const problems = validateFlowDefinition(
        {
          ...flow,
          steps: flow.steps.map((step, index) => (index === 0 ? { ...step, isReview: true } : step)),
        },
        flow
      );
      expect(problems.map(problem => problem.kind)).toContain('review-step');
    });

    it('accepts the built-in flows unchanged', () => {
      for (const [, flow] of flows) {
        const problems = validateFlowDefinition(flow, flow);
        expect(problems.filter(problem => problem.kind === 'review-step')).toEqual([]);
      }
    });
  });
});
