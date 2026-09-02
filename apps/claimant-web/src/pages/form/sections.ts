import type { CaseAnswers, CaseFlow, FlowStep } from '@tci/shared-types';

/**
 * Which section of the form each question belongs to.
 *
 * The chat asks one thing at a time, so it needs no grouping. A form shows six
 * or so at once and has to decide what belongs together — and the server, which
 * owns the order, has no opinion about that. This is the only place the form
 * adds anything the flow does not already say.
 *
 * **A plain map, not a rule engine.** There is no flow-editor UI, so nobody can
 * currently produce a flow with step ids this has not heard of. A map is
 * legible, greppable and wrong in obvious ways; a rule engine would be none of
 * those, and would be solving a problem that does not exist yet. If an editor
 * ever lands, revisit — the fallback below holds the line until then.
 *
 * Lives in claimant-web rather than shared-types because only the form uses it.
 * The chat, Telegram and WhatsApp all ask in path order and need no sections.
 */

export type SectionId = 'claim-type' | 'you-trip' | 'what-happened' | 'evidence' | 'payout' | 'review';

export interface SectionDefinition {
  id: SectionId;
  /** Shown in the section list and the "Step 3 of 6" bar. */
  title: string;
  /**
   * The heading above the fields, which is a **question**, not the section's
   * name. "Where should we pay?" asks for something; "Payout" labels a drawer.
   * The list needs the short label to stay scannable and the page needs the
   * question, so they are two strings rather than one used twice.
   */
  heading: string;
  subtitle?: string;
}

/** In the order the form walks them. The order is fixed; membership is not. */
export const SECTIONS: readonly SectionDefinition[] = [
  { id: 'claim-type', title: 'Claim type', heading: 'What do you want to claim for?', subtitle: 'We only ask the questions this type of claim needs.' },
  { id: 'you-trip', title: 'You & your trip', heading: 'You and your trip' },
  {
    id: 'what-happened',
    title: 'What happened',
    heading: 'What happened?',
    subtitle: 'Questions for this type of claim only.',
  },
  {
    id: 'evidence',
    title: 'Evidence',
    // Named for the claim type at render time — "Evidence for a flight delay"
    // rather than "Evidence", because what counts as evidence is the whole
    // question and the answer depends on which claim this is.
    heading: 'Evidence',
    subtitle: 'Photos are fine. You can add the rest later — come back on this device.',
  },
  { id: 'payout', title: 'Payout', heading: 'Where should we pay?' },
  { id: 'review', title: 'Review', heading: 'Check and submit', subtitle: 'Use Change on anything that is wrong.' },
];

/**
 * Fields that sit side by side on a wide screen.
 *
 * Declared rather than derived. A rule like "two consecutive dates pair" would
 * be shorter and would pair the wrong things the first time a flow put an
 * unrelated date after a trip date — and the failure would be silent, because a
 * misaligned field still works. These are the pairs the approved design shows,
 * and nothing else pairs.
 *
 * Both halves must be present in the section for a pair to apply; a branch that
 * drops one leaves the other full width rather than half-empty.
 */
const FIELD_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['trip-start', 'trip-end'],
  ['airline', 'flight-number'],
  ['scheduled-departure', 'actual-departure'],
  ['bank-account-number', 'bank-account-holder'],
];

/**
 * The section's fields, grouped into rows of one or two.
 *
 * Rows rather than a flat list because the pairing is a fact about the layout,
 * and working it out inside the render would put layout logic in three places —
 * desktop, phone, and the review page.
 */
export function rowsFor(steps: FlowStep[]): FlowStep[][] {
  const byId = new Map(steps.map(step => [step.id, step]));
  const paired = new Set<string>();
  const rows: FlowStep[][] = [];

  for (const step of steps) {
    if (paired.has(step.id)) continue;

    const pair = FIELD_PAIRS.find(([first]) => first === step.id);
    const partner = pair ? byId.get(pair[1]) : undefined;

    if (partner) {
      paired.add(partner.id);
      rows.push([step, partner]);
    } else {
      rows.push([step]);
    }
  }

  return rows;
}

/**
 * The pre-claim question, which belongs to no flow — the server asks it before
 * one has been chosen, so it is not in `flow.steps` at all.
 */
export const CLAIM_TYPE_STEP_ID = '__claim-type';

/**
 * Explicit membership for the steps that are not decided by their type.
 *
 * Documents and the review step are recognised by `answerType` instead (see
 * `sectionOf`), because those rules hold for any flow — including one this map
 * has never seen — and a list of twenty document ids would be a second place to
 * forget something.
 */
const SECTION_OF_STEP: Record<string, SectionId> = {
  [CLAIM_TYPE_STEP_ID]: 'claim-type',

  // Who they are and where they went. Shared by all five flows.
  'claimant-name': 'you-trip',
  'policy-number': 'you-trip',
  'trip-start': 'you-trip',
  'trip-end': 'you-trip',
  destination: 'you-trip',
  'incident-date': 'you-trip',

  // The per-type questions. Everything specific to what went wrong.
  airline: 'what-happened',
  'flight-number': 'what-happened',
  'scheduled-departure': 'what-happened',
  'actual-departure': 'what-happened',
  'baggage-tag': 'what-happened',
  'damage-description': 'what-happened',
  'contents-description': 'what-happened',
  'estimated-amount': 'what-happened',
  'cancellation-reason': 'what-happened',
  'treatment-country': 'what-happened',
  'hospital-name': 'what-happened',
  'diagnosis-description': 'what-happened',

  /**
   * Not a document, but it belongs with them: it is the notice that follows the
   * medical uploads, explaining that a specialist will read the report. Shown
   * anywhere else it would arrive without the thing it is about.
   */
  'medical-review-note': 'evidence',

  // Where the money goes.
  'bank-name': 'payout',
  'bank-account-number': 'payout',
  'bank-account-holder': 'payout',
};

/**
 * The section a step belongs to.
 *
 * The fallback is *What happened*, and it is deliberate: an unrecognised step
 * still renders, in the section whose meaning is loosest, instead of vanishing.
 * A question the claimant never sees is a claim that cannot be submitted and a
 * form that looks complete while it is not — far worse than one field in a
 * slightly odd place.
 */
export function sectionOf(step: Pick<FlowStep, 'id' | 'answerType' | 'isReview'>): SectionId {
  if (step.isReview) return 'review';
  if (step.answerType === 'document') return 'evidence';
  return SECTION_OF_STEP[step.id] ?? 'what-happened';
}

export interface ResolvedSection extends SectionDefinition {
  steps: FlowStep[];
  /** Every non-optional step in this section has an answer. */
  complete: boolean;
  /** No step in it has been answered yet. */
  untouched: boolean;
}

export interface SectionsView {
  sections: ResolvedSection[];
  /** Where someone lands when they arrive or come back. Null when all are done. */
  firstIncomplete: ResolvedSection | null;
}

/**
 * Group a flow's steps into the six sections, and say which are finished.
 *
 * Drives three things at once — the section list, the progress bar, and where a
 * returning claimant lands — from one calculation, so those three can never
 * disagree with each other.
 *
 * Completeness ignores optional steps. `policy-number` is optional in every
 * flow, and a section that stayed grey because somebody sensibly skipped one
 * would send them hunting for a question that was never required.
 *
 * The review section holds the confirm step but is never "complete": it is
 * finished by submitting, not by answering, and marking it done before then
 * would tick the last box on a claim nobody had sent.
 */
export function sectionsFor(flow: CaseFlow, answers: CaseAnswers): SectionsView {
  const grouped = new Map<SectionId, FlowStep[]>(SECTIONS.map(section => [section.id, []]));

  for (const step of flow.steps) {
    grouped.get(sectionOf(step))!.push(step);
  }

  const answered = (step: FlowStep) => answers[step.id] !== undefined && answers[step.id] !== '';

  const sections: ResolvedSection[] = SECTIONS.map(section => {
    const steps = grouped.get(section.id)!;
    const required = steps.filter(step => !step.optional);

    return {
      ...section,
      steps,
      complete: section.id === 'review' ? false : required.every(answered),
      untouched: !steps.some(answered),
    };
  });

  return {
    sections,
    firstIncomplete: sections.find(section => !section.complete && section.id !== 'review') ?? null,
  };
}
