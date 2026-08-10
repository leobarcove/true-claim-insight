/**
 * Flow overlay resolution — merges a canonical FlowDefinition with the sparse
 * per-channel and per-locale wording that overlays it.
 *
 * The split this module enforces:
 *   structure  (step ids, order, `next`, answerType, validation) — shared, never overridable
 *   presentation (prompt, label, choice labels)                  — overridable per channel/locale
 *
 * An overlay carries only presentation, so a WhatsApp claimant and a web
 * claimant always walk the same state machine. That guarantee is worth more
 * than it looks: it is what lets one publish gate, one completeness check and
 * one set of compliance invariants cover every channel at once.
 *
 * Consumed by:
 *  - chat-gateway: resolves one step per inbound turn before rendering
 *  - case-service: resolves the whole flow for the review summary
 *  - flow editor: `validateOverlay` powers the publish gate
 *
 * NOTE: type-only imports. `index.ts` re-exports this module, so a runtime
 * value import of CaseChannel would create a circular evaluation — harmless
 * under CJS, fatal under native ESM (Vite dev). Same reason as `case-flows.ts`.
 */
import type { CaseFlow, FlowStep } from './case-flows';
import type { CaseChannel } from './index';

/** The only fields an overlay may change. Structure is absent by design. */
export interface StepOverride {
  prompt?: string;
  label?: string;
  /**
   * Relabelled choices. `value` must already exist on the base step — adding
   * or removing a value changes what can be stored, which is structure, not
   * wording. Unknown values are dropped by the resolver and rejected by
   * `validateOverlay`.
   */
  choices?: Array<{ value: string; label: string }>;
}

export type FlowOverrides = Record<string, StepOverride>;

/** A FlowOverlay row, narrowed to what resolution needs. */
export interface FlowOverlayRecord {
  /** Null applies to every channel. */
  channel: CaseChannel | null;
  /** `en` | `ms`. Null applies to every locale. */
  locale: string | null;
  overrides: FlowOverrides;
}

/**
 * Precedence weight. Higher wins, and ties cannot occur because
 * (flowDefinitionId, channel, locale) is unique.
 *
 * Locale outranks channel deliberately. If a Malay overlay and a WhatsApp
 * overlay both touch the same step, the Malay wording wins: showing the right
 * language in a slightly wrong tone is cosmetic, whereas showing English to a
 * Malay speaker is a comprehension failure — and PDPA s.7 treats the language
 * of a claimant-facing notice as substantive, not stylistic. A (channel,
 * locale) overlay beats both and is how a channel gets its own tone in Malay.
 */
const precedence = (overlay: FlowOverlayRecord): number =>
  (overlay.locale ? 2 : 0) + (overlay.channel ? 1 : 0);

/** Overlays that apply to this (channel, locale), least specific first. */
const applicableOverlays = (
  overlays: FlowOverlayRecord[],
  channel: CaseChannel,
  locale: string
): FlowOverlayRecord[] =>
  overlays
    .filter(
      overlay =>
        (overlay.channel === null || overlay.channel === channel) &&
        (overlay.locale === null || overlay.locale === locale)
    )
    .sort((a, b) => precedence(a) - precedence(b));

/**
 * Apply one override to one step, keeping every structural field from the base.
 *
 * Written as an explicit field-by-field construction rather than a spread of
 * the override. A spread would silently adopt any extra key an overlay
 * happened to carry — including `next` — which is exactly the divergence the
 * overlay type exists to prevent. The type stops an author; this stops a
 * malformed row from the database.
 */
const applyOverride = (step: FlowStep, override: StepOverride): FlowStep => {
  const merged: FlowStep = {
    ...step,
    prompt: override.prompt ?? step.prompt,
    label: override.label ?? step.label,
  };

  if (override.choices && step.choices) {
    const relabelled = new Map(override.choices.map(choice => [choice.value, choice.label]));
    // Base order and base value set are authoritative; the overlay may only
    // supply a different label for a value that already exists.
    merged.choices = step.choices.map(choice => ({
      value: choice.value,
      label: relabelled.get(choice.value) ?? choice.label,
    }));
  }

  return merged;
};

/** Fold every applicable overlay into a single override map for the flow. */
const collapseOverrides = (
  overlays: FlowOverlayRecord[],
  channel: CaseChannel,
  locale: string
): FlowOverrides => {
  const collapsed: FlowOverrides = {};
  for (const overlay of applicableOverlays(overlays, channel, locale)) {
    for (const [stepId, override] of Object.entries(overlay.overrides ?? {})) {
      // Field-level merge, so a channel overlay that changes only the prompt
      // does not discard a locale overlay's label for the same step.
      collapsed[stepId] = { ...collapsed[stepId], ...override };
    }
  }
  return collapsed;
};

/**
 * Resolve a whole flow for one channel and locale.
 *
 * Use for the review summary and the editor preview. The chat gateway renders
 * one step per inbound turn and should use `resolveStep` instead.
 */
export const resolveFlow = (
  flow: CaseFlow,
  overlays: FlowOverlayRecord[],
  channel: CaseChannel,
  locale: string
): CaseFlow => {
  const overrides = collapseOverrides(overlays, channel, locale);
  if (Object.keys(overrides).length === 0) return flow;

  return {
    ...flow,
    steps: flow.steps.map(step =>
      overrides[step.id] ? applyOverride(step, overrides[step.id]) : step
    ),
  };
};

/**
 * Resolve a single step — the hot path, one call per inbound message.
 *
 * Returns the base step untouched when nothing overlays it, which is the
 * common case: overlays are sparse, and most steps read the same everywhere.
 */
export const resolveStep = (
  step: FlowStep,
  overlays: FlowOverlayRecord[],
  channel: CaseChannel,
  locale: string
): FlowStep => {
  const overrides = collapseOverrides(overlays, channel, locale);
  const override = overrides[step.id];
  return override ? applyOverride(step, override) : step;
};

export interface OverlayProblem {
  stepId: string;
  kind: 'unknown-step' | 'unknown-choice-value' | 'choices-on-non-choice-step';
  detail: string;
}

/**
 * Check an overlay against the flow it overlays. Feeds the publish gate and
 * the editor's inline warnings.
 *
 * These are the failures an overlay can still cause despite the type split.
 * A step renamed in a new flow version leaves its old override orphaned, and
 * an orphaned override is silent: the conversation runs, the claimant sees the
 * base wording, and the person who wrote the translation has no idea it never
 * shipped. Surfacing it at publish time is the only point anyone is looking.
 */
export const validateOverlay = (flow: CaseFlow, overrides: FlowOverrides): OverlayProblem[] => {
  const problems: OverlayProblem[] = [];
  const byId = new Map(flow.steps.map(step => [step.id, step]));

  for (const [stepId, override] of Object.entries(overrides ?? {})) {
    const step = byId.get(stepId);
    if (!step) {
      problems.push({
        stepId,
        kind: 'unknown-step',
        detail: `No step "${stepId}" in this flow version — the override will never be shown.`,
      });
      continue;
    }

    if (!override.choices) continue;

    if (!step.choices) {
      problems.push({
        stepId,
        kind: 'choices-on-non-choice-step',
        detail: `Step "${stepId}" is ${step.answerType}, not a choice step.`,
      });
      continue;
    }

    const known = new Set(step.choices.map(choice => choice.value));
    for (const choice of override.choices) {
      if (!known.has(choice.value)) {
        problems.push({
          stepId,
          kind: 'unknown-choice-value',
          detail: `Value "${choice.value}" is not defined on the base step. An overlay may relabel a choice, never add one.`,
        });
      }
    }
  }

  return problems;
};

/**
 * Steps that resolve to base wording for a given channel and locale — i.e. the
 * copy still untranslated or unadapted.
 *
 * The publish gate uses this to refuse a flow whose `ms` coverage is
 * incomplete, mirroring ConsentNotice's rule that a version is not complete
 * until both locales exist (PDPA s.7). The editor uses the same call to draw a
 * per-channel completeness bar.
 */
export const uncoveredSteps = (
  flow: CaseFlow,
  overlays: FlowOverlayRecord[],
  channel: CaseChannel,
  locale: string
): string[] => {
  const overrides = collapseOverrides(overlays, channel, locale);
  return flow.steps
    .filter(step => overrides[step.id]?.prompt === undefined)
    .map(step => step.id);
};
