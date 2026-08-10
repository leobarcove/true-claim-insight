import {
  CASE_FLOWS,
  CaseChannel,
  evaluateNext,
  getFlow,
  resolveFlow,
  resolveNextStep,
  resolveStep,
  systemStepIds,
  uncoveredSteps,
  validateFlowDefinition,
  validateOverlay,
  // The shared-types enum, not Prisma's string-literal union: CaseFlow is typed
  // against this one, and only `getFlow` accepts either form.
  TravelClaimType,
  type CaseFlow,
  type FlowOverlayRecord,
  type FlowStep,
  type NextRule,
} from '@tci/shared-types';

/**
 * FLOW AUTHORING TESTS — the machinery that lets one flow serve every channel.
 *
 * Three properties are load-bearing and none of them fail loudly in production,
 * which is why they are pinned here:
 *
 *  - A NextRule evaluates identically wherever it runs. The publish gate walks
 *    rules statically and the conversation evaluates them per turn; if those
 *    two disagreed, a flow would validate and then misbehave.
 *  - The publish gate catches the breakages that are otherwise silent — a
 *    branch to a deleted step ends the conversation without an error, and a
 *    dropped `system` step stops a regulatory clock while the claim still looks
 *    healthy.
 *  - An overlay can change wording and nothing else. That is the whole basis
 *    for one flow serving web chat, Telegram, WhatsApp and Messenger.
 */
describe('flow authoring', () => {
  const step = (id: string, next: NextRule, extra: Partial<FlowStep> = {}): FlowStep => ({
    id,
    prompt: `Prompt for ${id}`,
    label: id,
    answerType: 'text',
    next,
    ...extra,
  });

  const flowOf = (steps: FlowStep[], entryStepId = steps[0].id): CaseFlow => ({
    travelClaimType: TravelClaimType.FLIGHT_DELAY,
    entryStepId,
    steps,
  });

  describe('NextRule evaluation', () => {
    it('follows a plain step and terminates on end', () => {
      expect(evaluateNext({ type: 'step', stepId: 'b' }, {})).toBe('b');
      expect(evaluateNext({ type: 'end' }, {})).toBeNull();
    });

    it('ANDs every condition in a branch', () => {
      const rule: NextRule = {
        type: 'branch',
        when: [
          { stepId: 'reason', op: 'eq', value: 'ILLNESS' },
          { stepId: 'amount', op: 'gt', value: 100 },
        ],
        then: 'medical',
        else: 'invoice',
      };
      expect(evaluateNext(rule, { reason: 'ILLNESS', amount: 500 })).toBe('medical');
      // Second condition fails, so the whole branch does.
      expect(evaluateNext(rule, { reason: 'ILLNESS', amount: 50 })).toBe('invoice');
    });

    it('treats an empty string as not existing, not as an answer', () => {
      const exists: NextRule = {
        type: 'branch',
        when: [{ stepId: 'x', op: 'exists' }],
        then: 'yes',
        else: 'no',
      };
      expect(evaluateNext(exists, {})).toBe('no');
      expect(evaluateNext(exists, { x: '' })).toBe('no');
      expect(evaluateNext(exists, { x: 'something' })).toBe('yes');
    });

    it('passes notIn for an unanswered step — the gotcha worth knowing', () => {
      // An author writing "if reason is not X, go to Y" gets Y for a claimant
      // who has not reached that question yet. Correct for skip-ahead
      // resolution, surprising if you expect an unanswered step to fail
      // everything, so it is pinned rather than left to be rediscovered.
      const rule: NextRule = {
        type: 'branch',
        when: [{ stepId: 'reason', op: 'notIn', value: ['ILLNESS'] }],
        then: 'skip-medical',
        else: 'ask-medical',
      };
      expect(evaluateNext(rule, {})).toBe('skip-medical');
      expect(evaluateNext(rule, { reason: 'ILLNESS' })).toBe('ask-medical');
    });

    it('routes multi-way with switch and falls back to default', () => {
      const rule: NextRule = {
        type: 'switch',
        on: 'peril',
        cases: [
          { value: 'FLOOD', goto: 'flood-depth' },
          { value: 'FIRE', goto: 'fire-origin' },
        ],
        default: 'generic-loss',
      };
      expect(evaluateNext(rule, { peril: 'FLOOD' })).toBe('flood-depth');
      expect(evaluateNext(rule, { peril: 'FIRE' })).toBe('fire-origin');
      expect(evaluateNext(rule, { peril: 'LIGHTNING' })).toBe('generic-loss');
      expect(evaluateNext(rule, {})).toBe('generic-loss');
    });

    it('drives the real trip-cancellation branch both ways', () => {
      const flow = getFlow(TravelClaimType.TRIP_CANCELLATION);
      const base = { 'estimated-amount': 1200 };

      expect(
        resolveNextStep(flow, 'estimated-amount', {
          ...base,
          'cancellation-reason': 'ILLNESS',
        })
      ).toBe('doc-medical-report');

      expect(
        resolveNextStep(flow, 'estimated-amount', {
          ...base,
          'cancellation-reason': 'NATURAL_DISASTER',
        })
      ).toBe('doc-booking-invoice');
    });
  });

  describe('publish gate', () => {
    it('passes every built-in flow', () => {
      for (const [type, flow] of Object.entries(CASE_FLOWS)) {
        expect({ type, problems: validateFlowDefinition(flow, flow) }).toEqual({
          type,
          problems: [],
        });
      }
    });

    it('rejects a branch pointing at a step that does not exist', () => {
      const flow = flowOf([
        step('a', { type: 'branch', when: [], then: 'ghost', else: 'b' }),
        step('b', { type: 'end' }),
      ]);
      const problems = validateFlowDefinition(flow);
      expect(problems).toContainEqual(
        expect.objectContaining({ kind: 'unknown-target', stepId: 'a' })
      );
    });

    it('rejects an unreachable step', () => {
      const flow = flowOf([
        step('a', { type: 'step', stepId: 'b' }),
        step('b', { type: 'end' }),
        step('orphan', { type: 'end' }),
      ]);
      expect(validateFlowDefinition(flow)).toContainEqual(
        expect.objectContaining({ kind: 'unreachable-step', stepId: 'orphan' })
      );
    });

    it('rejects a cycle rather than looping forever', () => {
      const flow = flowOf([
        step('a', { type: 'step', stepId: 'b' }),
        step('b', { type: 'step', stepId: 'a' }),
      ]);
      expect(validateFlowDefinition(flow)).toContainEqual(
        expect.objectContaining({ kind: 'cycle' })
      );
    });

    it('rejects a duplicate step id, because answers are keyed by it', () => {
      const flow = flowOf([
        step('a', { type: 'step', stepId: 'dup' }),
        step('dup', { type: 'end' }),
        step('dup', { type: 'end' }),
      ]);
      expect(validateFlowDefinition(flow)).toContainEqual(
        expect.objectContaining({ kind: 'duplicate-step-id', stepId: 'dup' })
      );
    });

    it('refuses a flow that dropped a system step', () => {
      const reference = getFlow(TravelClaimType.FLIGHT_DELAY);
      const withoutIncidentDate = flowOf(
        reference.steps
          .filter(s => s.id !== 'incident-date')
          .map(s => (s.id === 'destination' ? { ...s, next: { type: 'end' as const } } : s)),
        reference.entryStepId
      );

      expect(validateFlowDefinition(withoutIncidentDate, reference)).toContainEqual(
        expect.objectContaining({ kind: 'missing-system-step', stepId: 'incident-date' })
      );
    });

    it('names the steps nothing else may remove', () => {
      const marked = systemStepIds(getFlow(TravelClaimType.FLIGHT_DELAY)).sort();
      expect(marked).toEqual(
        ['bank-account-number', 'incident-date', 'review', 'trip-start'].sort()
      );
    });

    it('flags a choice step with no options', () => {
      const flow = flowOf([step('pick', { type: 'end' }, { answerType: 'choice' })]);
      expect(validateFlowDefinition(flow)).toContainEqual(
        expect.objectContaining({ kind: 'empty-choices', stepId: 'pick' })
      );
    });
  });

  describe('overlay resolution', () => {
    const baseFlow = flowOf([
      step('greeting', { type: 'step', stepId: 'reason' }),
      step('reason', { type: 'end' }, {
        answerType: 'choice',
        choices: [
          { value: 'ILLNESS', label: 'Serious illness' },
          { value: 'OTHER', label: 'Other reason' },
        ],
      }),
    ]);

    const overlay = (
      channel: CaseChannel | null,
      locale: string | null,
      overrides: FlowOverlayRecord['overrides']
    ): FlowOverlayRecord => ({ channel, locale, overrides });

    it('inherits the base wording when nothing overlays a step', () => {
      const resolved = resolveFlow(baseFlow, [], CaseChannel.WHATSAPP, 'en');
      expect(resolved.steps[0].prompt).toBe('Prompt for greeting');
    });

    it('applies a channel overlay', () => {
      const overlays = [
        overlay(CaseChannel.WHATSAPP, null, { greeting: { prompt: 'Short WhatsApp copy' } }),
      ];
      expect(resolveStep(baseFlow.steps[0], overlays, CaseChannel.WHATSAPP, 'en').prompt).toBe(
        'Short WhatsApp copy'
      );
      // A different channel is untouched by it.
      expect(resolveStep(baseFlow.steps[0], overlays, CaseChannel.TELEGRAM, 'en').prompt).toBe(
        'Prompt for greeting'
      );
    });

    it('lets locale outrank channel — language matters more than tone', () => {
      const overlays = [
        overlay(CaseChannel.WHATSAPP, null, { greeting: { prompt: 'Short WhatsApp copy' } }),
        overlay(null, 'ms', { greeting: { prompt: 'Salam sejahtera' } }),
      ];
      expect(resolveStep(baseFlow.steps[0], overlays, CaseChannel.WHATSAPP, 'ms').prompt).toBe(
        'Salam sejahtera'
      );
    });

    it('lets a channel+locale overlay beat both', () => {
      const overlays = [
        overlay(CaseChannel.WHATSAPP, null, { greeting: { prompt: 'Short WhatsApp copy' } }),
        overlay(null, 'ms', { greeting: { prompt: 'Salam sejahtera' } }),
        overlay(CaseChannel.WHATSAPP, 'ms', { greeting: { prompt: 'Salam — ringkas' } }),
      ];
      expect(resolveStep(baseFlow.steps[0], overlays, CaseChannel.WHATSAPP, 'ms').prompt).toBe(
        'Salam — ringkas'
      );
    });

    it('merges field by field, so a prompt override keeps another overlay label', () => {
      const overlays = [
        overlay(null, 'ms', { greeting: { label: 'Ucapan' } }),
        overlay(CaseChannel.TELEGRAM, null, { greeting: { prompt: 'Telegram copy' } }),
      ];
      const resolved = resolveStep(baseFlow.steps[0], overlays, CaseChannel.TELEGRAM, 'ms');
      expect(resolved.prompt).toBe('Telegram copy');
      expect(resolved.label).toBe('Ucapan');
    });

    it('never lets an overlay change structure, even from a malformed row', () => {
      const rogue = [
        overlay(CaseChannel.TELEGRAM, null, {
          greeting: {
            prompt: 'Rewritten',
            // A row that carries structural keys it has no business carrying.
            next: { type: 'end' },
            answerType: 'number',
          } as never,
        }),
      ];
      const resolved = resolveStep(baseFlow.steps[0], rogue, CaseChannel.TELEGRAM, 'en');
      expect(resolved.prompt).toBe('Rewritten');
      expect(resolved.next).toEqual({ type: 'step', stepId: 'reason' });
      expect(resolved.answerType).toBe('text');
    });

    it('relabels a choice without changing the value set', () => {
      const overlays = [
        overlay(null, 'ms', {
          reason: {
            choices: [
              { value: 'ILLNESS', label: 'Penyakit serius' },
              { value: 'INVENTED', label: 'Should be ignored' },
            ],
          },
        }),
      ];
      const resolved = resolveStep(baseFlow.steps[1], overlays, CaseChannel.WEB_CHAT, 'ms');
      expect(resolved.choices).toEqual([
        { value: 'ILLNESS', label: 'Penyakit serius' },
        { value: 'OTHER', label: 'Other reason' }, // untouched, inherited
      ]);
    });

    it('reports an override that no longer matches any step', () => {
      const problems = validateOverlay(baseFlow, {
        renamed: { prompt: 'Orphaned by a step rename' },
      });
      expect(problems).toContainEqual(
        expect.objectContaining({ kind: 'unknown-step', stepId: 'renamed' })
      );
    });

    it('reports a choice value an overlay tried to invent', () => {
      const problems = validateOverlay(baseFlow, {
        reason: { choices: [{ value: 'INVENTED', label: 'New option' }] },
      });
      expect(problems).toContainEqual(
        expect.objectContaining({ kind: 'unknown-choice-value', stepId: 'reason' })
      );
    });

    it('lists the steps still untranslated for a locale', () => {
      const overlays = [overlay(null, 'ms', { greeting: { prompt: 'Salam sejahtera' } })];
      expect(uncoveredSteps(baseFlow, overlays, CaseChannel.WEB_CHAT, 'ms')).toEqual(['reason']);
    });
  });
});
