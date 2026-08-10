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
  | 'duplicate-step-id';

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

  // Termination: from the entry, following the longest possible path, the walk
  // must run out of steps rather than run forever. Bounded by step count
  // because a flow that revisits a step has by definition looped.
  let cursor: string | null = flow.entryStepId;
  const walked = new Set<string>();
  while (cursor && byId.has(cursor)) {
    if (walked.has(cursor)) {
      problems.push({
        kind: 'cycle',
        stepId: cursor,
        detail: `"${cursor}" is reachable from itself. A claimant would be asked the same question forever.`,
      });
      break;
    }
    walked.add(cursor);
    const step = byId.get(cursor) as FlowStep;
    const targets = ruleTargets(step.next);
    cursor = targets.length > 0 ? targets[0] : null;
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
