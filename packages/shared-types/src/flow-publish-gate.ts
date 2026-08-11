/**
 * The publish gate — what a FlowDefinition must satisfy before it can go
 * PUBLISHED and start being walked by real claimants.
 *
 * These checks exist because the failure mode of a broken flow is silence. A
 * step whose `next` points at a deleted id does not throw; the conversation
 * simply ends early and the Case sits in IN_PROGRESS looking like a claimant
 * who wandered off. A dropped `incident-date` does not throw either; the claim
 * proceeds and a regulatory deadline quietly stops being computed. Nobody goes
 * looking for a question that was never asked.
 *
 * Publish is the one moment someone is paying attention, so it is where the
 * checking belongs. `case-flows.spec.ts` asserts the same invariants at CI
 * time for the built-in flows; this is that logic made available at runtime,
 * for flows an author wrote rather than a developer.
 */
import type { CaseFlow, FlowStep } from './case-flows';
import { ruleTargets } from './case-flows';

export type FlowProblemKind =
  | 'missing-entry-step'
  | 'unknown-target'
  | 'unreachable-step'
  | 'cycle'
  | 'missing-system-step'
  | 'empty-choices'
  | 'document-without-type'
  | 'duplicate-step-id'
  | 'dead-end-rule'
  | 'empty-prompt'
  | 'invalid-pattern'
  | 'step-id-too-long';

export interface FlowProblem {
  kind: FlowProblemKind;
  /** Step the problem attaches to, where there is one. */
  stepId?: string;
  detail: string;
}

/**
 * Step ids the rest of the platform reads by name. Sourced from the built-in
 * flows' `system: true` markers rather than duplicated here, so marking a new
 * step in `case-flows.ts` is the single action that protects it.
 */
export const systemStepIds = (reference: CaseFlow): string[] =>
  reference.steps.filter(step => step.system).map(step => step.id);

/** Walk every statically reachable step from the entry, following all branches. */
const reachableSteps = (flow: CaseFlow): Set<string> => {
  const byId = new Map(flow.steps.map(step => [step.id, step]));
  const seen = new Set<string>();
  const queue: string[] = [flow.entryStepId];

  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    const step = byId.get(id);
    if (!step) continue;
    // Every branch is followed, not just the one the current answers select —
    // an unreachable step must be unreachable under *all* answers, or the
    // check would flag steps that are simply on the road less travelled.
    for (const target of ruleTargets(step.next)) queue.push(target);
  }

  return seen;
};

/**
 * Validate a flow for publication.
 *
 * `reference` supplies the system-step contract — pass the built-in flow for
 * the same claim type. Omit it to skip that check, which is right when
 * validating a draft mid-edit but never right at publish.
 */
export const validateFlowDefinition = (
  flow: CaseFlow,
  reference?: CaseFlow
): FlowProblem[] => {
  const problems: FlowProblem[] = [];
  const byId = new Map<string, FlowStep>();

  for (const step of flow.steps) {
    if (byId.has(step.id)) {
      problems.push({
        kind: 'duplicate-step-id',
        stepId: step.id,
        detail: `Step id "${step.id}" appears more than once. Answers are keyed by step id, so the second would overwrite the first.`,
      });
      continue;
    }
    byId.set(step.id, step);
  }

  if (!byId.has(flow.entryStepId)) {
    problems.push({
      kind: 'missing-entry-step',
      detail: `Entry step "${flow.entryStepId}" is not in this flow — the conversation has nowhere to begin.`,
    });
  }

  for (const step of flow.steps) {
    for (const target of ruleTargets(step.next)) {
      if (!byId.has(target)) {
        problems.push({
          kind: 'unknown-target',
          stepId: step.id,
          detail: `"${step.id}" leads to "${target}", which does not exist. The conversation would end here without saying so.`,
        });
      }
    }

    if (step.answerType === 'choice' && (!step.choices || step.choices.length === 0)) {
      problems.push({
        kind: 'empty-choices',
        stepId: step.id,
        detail: `"${step.id}" is a choice step with no options — nothing can be selected.`,
      });
    }

    if (step.answerType === 'document' && !step.documentType) {
      problems.push({
        kind: 'document-without-type',
        stepId: step.id,
        detail: `"${step.id}" asks for a document but declares no documentType, so the upload cannot be filed against an evidence requirement.`,
      });
    }
  }

  const reachable = reachableSteps(flow);
  for (const step of flow.steps) {
    if (!reachable.has(step.id)) {
      problems.push({
        kind: 'unreachable-step',
        stepId: step.id,
        detail: `"${step.id}" cannot be reached from the entry step under any answers. It will never be asked.`,
      });
    }
  }

  // Termination, down EVERY arm rather than the first.
  //
  // This followed `targets[0]` only, so a cycle reachable through a branch's
  // `else` or a non-first switch case was invisible — and those are precisely
  // the arms an author gets wrong, because the happy path is the one they
  // walk through by hand. Depth-first over all targets, tracking the path
  // rather than a flat visited set, so a diamond (two arms rejoining) is not
  // mistaken for a loop.
  const cycleFound = new Set<string>();
  const walk = (stepId: string, path: string[]): void => {
    if (path.includes(stepId)) {
      if (!cycleFound.has(stepId)) {
        cycleFound.add(stepId);
        problems.push({
          kind: 'cycle',
          stepId,
          detail:
            `"${stepId}" is reachable from itself via ${[...path.slice(path.indexOf(stepId)), stepId].join(' → ')}. ` +
            'A claimant would be asked the same question forever.',
        });
      }
      return;
    }
    const step = byId.get(stepId);
    if (!step) return;
    for (const target of ruleTargets(step.next)) walk(target, [...path, stepId]);
  };
  if (byId.has(flow.entryStepId)) walk(flow.entryStepId, []);

  for (const step of flow.steps) {
    // A rule that can resolve to nothing. `resolveNextStep` returns null for
    // it, which the conversation reads as "the flow is over" — so a claimant
    // taking the unhandled arm was treated as having reached the review. A
    // switch needs a default; a branch needs both arms.
    if (step.next.type === 'branch' && (step.next.then === null || step.next.else === null)) {
      problems.push({
        kind: 'dead-end-rule',
        stepId: step.id,
        detail: `"${step.id}" has a branch arm pointing nowhere. Every arm must name a step or end the flow explicitly.`,
      });
    }
    if (step.next.type === 'switch' && !step.next.default) {
      problems.push({
        kind: 'dead-end-rule',
        stepId: step.id,
        detail: `"${step.id}" is a switch with no default. An answer matching no case would silently end the conversation.`,
      });
    }

    // Telegram rejects an empty message body outright, so the send throws and
    // the claimant gets an apology in place of a question they can answer.
    if (!step.prompt?.trim()) {
      problems.push({
        kind: 'empty-prompt',
        stepId: step.id,
        detail: `"${step.id}" has no prompt. There would be nothing to ask.`,
      });
    }
    if (!step.label?.trim()) {
      problems.push({
        kind: 'empty-prompt',
        stepId: step.id,
        detail: `"${step.id}" has no label. It would appear unnamed in the review and the edit menu.`,
      });
    }

    // Compiled here rather than per answer. An invalid pattern throws inside
    // `validateAnswer`, which makes the step permanently unanswerable behind a
    // generic apology — a flow nobody can complete and nothing explaining why.
    if (step.validation?.pattern) {
      try {
        new RegExp(step.validation.pattern);
      } catch (error) {
        problems.push({
          kind: 'invalid-pattern',
          stepId: step.id,
          detail: `"${step.id}" has a validation pattern that will not compile: ${(error as Error).message}`,
        });
      }
    }

    // A tapped button carries "<stepId>|<value>" and Telegram caps that at 64
    // bytes. Over it the step id is dropped at render time, which silently
    // loses the protection against a stale tap being applied to the wrong
    // question — so it is refused here instead.
    const longestChoice = Math.max(0, ...(step.choices ?? []).map(c => c.value.length));
    if (step.choices?.length && step.id.length + 1 + longestChoice > 64) {
      problems.push({
        kind: 'step-id-too-long',
        stepId: step.id,
        detail:
          `"${step.id}" plus its longest choice value exceeds the 64 bytes a tapped button can ` +
          'carry. Shorten the step id or the choice values.',
      });
    }
  }

  if (reference) {
    for (const required of systemStepIds(reference)) {
      const step = byId.get(required);
      if (!step) {
        problems.push({
          kind: 'missing-system-step',
          stepId: required,
          detail: `"${required}" is required: something outside the conversation reads this answer by id. Removing it breaks that silently.`,
        });
        continue;
      }
      if (!reachable.has(required)) {
        problems.push({
          kind: 'missing-system-step',
          stepId: required,
          detail: `"${required}" exists but cannot be reached, so its answer would never be captured.`,
        });
      }
    }
  }

  return problems;
};

/** Convenience for callers that only need the verdict. */
export const canPublish = (flow: CaseFlow, reference?: CaseFlow): boolean =>
  validateFlowDefinition(flow, reference).length === 0;
