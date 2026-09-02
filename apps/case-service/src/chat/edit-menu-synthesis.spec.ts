import { CASE_FLOWS, TravelClaimType, type CaseAnswers, type CaseFlow } from '@tci/shared-types';

import { ConversationGateway } from './conversation.gateway';

/**
 * The edit menu has to be rebuildable, not only sendable.
 *
 * A push channel is handed the step and draws its keyboard on the spot. A pull
 * channel — the PWA, and the web form after it — has only what was persisted,
 * and the transcript stores text, not choices. So when a claimant typed "edit"
 * at the review, the PWA showed "Which detail would you like to change?" with
 * nothing to tap: the case's cursor is still on the review step, `getStep`
 * found no `__edit-menu` in any flow, and the claimant was stranded at the one
 * question with no other route. That is docs/INTAKE_CHANGE_SOMETHING_GAP.md.
 */
describe('synthesiseStep rebuilds the edit menu', () => {
  const flow = CASE_FLOWS[TravelClaimType.FLIGHT_DELAY] as CaseFlow;

  // Only the two collaborators these paths touch. Standing the whole gateway up
  // would need a database and would test the wiring, not the rebuild.
  const gateway = new ConversationGateway(
    {} as never,
    {} as never,
    {} as never,
    { currentNotice: jest.fn() } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never
  );

  const synthesise = (answers: CaseAnswers) =>
    gateway.synthesiseStep('__edit-menu', 'en', { flow, answers });

  it('offers one choice per answered step', async () => {
    const step = await synthesise({ 'claimant-name': 'Nur Aisyah', destination: 'JP' });

    expect(step).not.toBeNull();
    expect(step!.answerType).toBe('choice');
    expect(step!.choices).toHaveLength(3);
  });

  /**
   * The callback value is the contract between the menu and the handler that
   * acts on a tap. If the rebuilt menu emitted a different shape, a claimant on
   * the PWA would tap a button and nothing would happen — which is worse than
   * the gap it replaced, because it looks like it worked.
   */
  it('emits the same __edit:<stepId> callbacks the push channels send', async () => {
    const step = await synthesise({ destination: 'JP' });

    expect(step!.choices).toContainEqual(expect.objectContaining({ value: '__edit:destination' }));
  });

  it('shows the current value on the button, so a typo can be found', async () => {
    const step = await synthesise({ 'claimant-name': 'Nur Aisyah' });

    expect(step!.choices!.find(choice => choice.value === '__edit:claimant-name')?.label).toContain(
      'Nur Aisyah'
    );
  });

  it('skips steps with no answer — there is nothing to change about them', async () => {
    const step = await synthesise({ destination: 'JP' });

    expect(step!.choices!.map(choice => choice.value)).toEqual([
      '__edit-cancel',
      '__edit:destination',
    ]);
  });

  it('always offers a way back to review without changing an answer', async () => {
    const step = await synthesise({ destination: 'JP' });

    expect(step!.choices).toContainEqual({
      value: '__edit-cancel',
      label: 'Cancel — back to review',
      title: 'Cancel',
      description: 'Return to review without changing anything',
    });
  });

  it('returns null when nothing has been answered, rather than an empty menu', async () => {
    expect(await synthesise({})).toBeNull();
  });

  // Without the case there is no menu to rebuild, and inventing an empty one
  // would put a question on screen that answers nothing.
  it('returns null when no case context is supplied', async () => {
    expect(await gateway.synthesiseStep('__edit-menu', 'en')).toBeNull();
  });

  it('still returns null for a step id that belongs to nothing', async () => {
    expect(await gateway.synthesiseStep('__nonsense', 'en', { flow, answers: {} })).toBeNull();
  });
});
