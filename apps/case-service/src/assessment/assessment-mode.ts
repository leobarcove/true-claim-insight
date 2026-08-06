import { Prisma } from '@prisma/client';

type Decimal = Prisma.Decimal;

/**
 * The assessment-mode router (MASTER_PLAN §2.4).
 *
 * How a claim is examined, and why. Four conditions must **all** hold before a
 * claim takes the desk-review fast track; anything else is assessed at a higher
 * level, and three triggers pull a claim back out mid-flight.
 *
 * ## The mode is a disclosable method, not an internal optimisation
 *
 * PD 12.6 requires the adjusting report to disclose the **methods** behind an
 * assessment. "Desk review on documents alone" and "site inspection" are
 * different methods reaching the same figure, and a reader is entitled to know
 * which produced it. Every decision here therefore returns its reasons, and
 * they are recorded rather than recomputed — a threshold changed next year must
 * not restate why a claim was fast-tracked last year.
 *
 * ## Escalation is one level at a time
 *
 * A fraud signal on a desk review moves it to video, not straight to a site
 * visit. Jumping levels wastes the cheaper step that might have resolved the
 * question, and the COGS ceiling in §2.5 is what makes the cheap step worth
 * attempting first.
 */

export type AssessmentMode = 'DESK_REVIEW' | 'VIDEO' | 'SITE_VISIT' | 'EXPERT_REFERRAL';

/** Cheapest first. Escalation moves one step right. */
export const MODE_LADDER: AssessmentMode[] = [
  'DESK_REVIEW',
  'VIDEO',
  'SITE_VISIT',
  'EXPERT_REFERRAL',
];

export type EscalationTrigger =
  | 'FRAUD_SIGNAL'
  | 'AMOUNT_REVISED_UP'
  | 'EXTRACTION_INCONSISTENCY'
  | 'ADJUSTER_JUDGEMENT';

export interface FastTrackPolicy {
  /** Categories the firm will desk-review at all. Absent means none. */
  categories: string[];
  /** Per-category ceiling. A category with no limit is never fast-tracked. */
  limits: Record<string, Decimal>;
}

/**
 * When a loss is examined in person rather than over a video call.
 *
 * Only some lines can be inspected at all: a fire or flood loss has a risk
 * address, a travel loss happened overseas and has none. Among the inspectable
 * lines it is a question of value — sending an adjuster to a RM2,000 burglary
 * costs more than the difference it makes, while assessing a RM300,000 fire
 * from photographs is not an assessment an insurer would accept.
 *
 * Absent by default, and absence means **no automatic site visit**, matching
 * `FastTrackPolicy` above: a firm that has not set its thresholds has not
 * authorised the travel cost either, and spending is the direction that cannot
 * be taken back. Escalation still reaches `SITE_VISIT` by hand whatever this
 * says (see `escalateMode`) — this governs only the opening decision.
 */
export interface InspectionPolicy {
  /** Categories with a physical risk address worth attending. Absent means none. */
  categories: string[];
  /**
   * Per-category value at or above which the loss is inspected. A category
   * listed with no threshold is never routed to a site visit, for the same
   * reason a fast-track category with no ceiling is never fast-tracked.
   */
  thresholds: Record<string, Decimal>;
}

export interface ModeInput {
  category: string;
  /** Estimated or assessed amount. Unknown blocks the fast track. */
  estimatedAmount?: Decimal | null;
  /** True where any open fraud signal is MEDIUM or above. */
  hasOpenFraudSignal: boolean;
  /** True where every mandatory evidence item is present. */
  evidenceComplete: boolean;
  policy: FastTrackPolicy;
  /** The firm's site-visit policy. Absent means it never routes there. */
  inspection?: InspectionPolicy;
  /** Medical claims are never desk-reviewed — see MASTER_PLAN §1. */
  isMedical?: boolean;
}

export interface ModeDecision {
  mode: AssessmentMode;
  /** Why, in an adjuster's terms. Recorded, and disclosed in the report. */
  reasons: string[];
  /** True where every fast-track condition held. */
  fastTracked: boolean;
}

/** The default when the fast track does not apply. */
const STANDARD: AssessmentMode = 'VIDEO';

export function resolveAssessmentMode(input: ModeInput): ModeDecision {
  const reasons: string[] = [];

  // Medical is excluded ahead of the economic tests. It is not a question of
  // value: a medical claim goes to a human expert regardless of size, and
  // letting a small one through on amount would defeat the rule in §1.
  if (input.isMedical) {
    return {
      mode: 'EXPERT_REFERRAL',
      reasons: ['Medical claims are referred to a claims expert and never desk-reviewed'],
      fastTracked: false,
    };
  }

  const eligibleCategory = input.policy.categories.includes(input.category);
  if (!eligibleCategory) {
    reasons.push(`${input.category} is not on the firm's fast-track list`);
  }

  const limit = input.policy.limits[input.category];
  let withinLimit = false;

  if (!limit) {
    if (eligibleCategory) {
      // A category listed with no ceiling is a configuration gap, and the safe
      // reading is "no fast track" rather than "any amount".
      reasons.push(`No fast-track limit is configured for ${input.category}`);
    }
  } else if (input.estimatedAmount === undefined || input.estimatedAmount === null) {
    reasons.push('No estimated amount, so the fast-track limit cannot be tested');
  } else if (input.estimatedAmount.greaterThan(limit)) {
    reasons.push(
      `Estimated ${input.estimatedAmount.toFixed(2)} exceeds the fast-track limit of ${limit.toFixed(2)}`
    );
  } else {
    withinLimit = true;
  }

  if (input.hasOpenFraudSignal) {
    reasons.push('An open fraud signal at MEDIUM or above requires more than a desk review');
  }

  if (!input.evidenceComplete) {
    reasons.push('The evidence checklist is incomplete');
  }

  const fastTracked =
    eligibleCategory && withinLimit && !input.hasOpenFraudSignal && input.evidenceComplete;

  if (fastTracked) {
    return {
      mode: 'DESK_REVIEW',
      reasons: [
        `${input.category} within the fast-track limit of ${limit!.toFixed(2)}`,
        'No open fraud signal at MEDIUM or above',
        'Evidence checklist complete',
      ],
      fastTracked: true,
    };
  }

  // The fast track has been refused, so this loss is examined. Whether that
  // means attending it depends on the firm's inspection policy: a property loss
  // above the threshold is seen, everything else is interviewed over video.
  const threshold = input.inspection?.categories.includes(input.category)
    ? input.inspection.thresholds[input.category]
    : undefined;

  if (
    threshold &&
    input.estimatedAmount !== undefined &&
    input.estimatedAmount !== null &&
    input.estimatedAmount.greaterThanOrEqualTo(threshold)
  ) {
    return {
      mode: 'SITE_VISIT',
      // The fast-track failures stay in the record. They are why this claim is
      // not on a desk review, which a report reader is entitled to see even
      // though the outcome went further than video.
      reasons: [
        ...reasons,
        `${input.category} at ${input.estimatedAmount.toFixed(2)} reaches the site-visit threshold of ${threshold.toFixed(2)}`,
      ],
      fastTracked: false,
    };
  }

  return { mode: STANDARD, reasons, fastTracked: false };
}

/**
 * Move a claim one level up the ladder.
 *
 * Returns the same mode when already at the top: an expert referral has nowhere
 * further to go, and reporting that as a change would manufacture an audit row
 * describing a decision nobody made.
 */
export function escalateMode(
  current: AssessmentMode,
  trigger: EscalationTrigger
): ModeDecision & { changed: boolean } {
  const index = MODE_LADDER.indexOf(current);
  const next = MODE_LADDER[Math.min(index + 1, MODE_LADDER.length - 1)];

  if (next === current) {
    return {
      mode: current,
      reasons: [`Already at ${current}; ${describe(trigger)} cannot escalate further`],
      fastTracked: false,
      changed: false,
    };
  }

  return {
    mode: next,
    reasons: [`Escalated from ${current} to ${next}: ${describe(trigger)}`],
    fastTracked: false,
    changed: true,
  };
}

function describe(trigger: EscalationTrigger): string {
  switch (trigger) {
    case 'FRAUD_SIGNAL':
      return 'a fraud signal was raised';
    case 'AMOUNT_REVISED_UP':
      return 'the estimated amount was revised upward';
    case 'EXTRACTION_INCONSISTENCY':
      return 'document extraction was inconsistent with the claim';
    case 'ADJUSTER_JUDGEMENT':
      return 'the adjuster judged a higher level of assessment necessary';
  }
}

/** Prose for the report's methodology section (PD 12.6). */
export function describeMode(mode: AssessmentMode, reasons: string[]): string {
  const how: Record<AssessmentMode, string> = {
    DESK_REVIEW: 'Assessed by desk review on the documents submitted, without an interview.',
    VIDEO: 'Assessed by remote video interview with the claimant, with documents.',
    SITE_VISIT: 'Assessed by physical inspection at the risk address.',
    EXPERT_REFERRAL: 'Referred to a claims expert for assessment.',
  };

  return [how[mode], '', 'Basis for this level of assessment:', ...reasons.map(r => `  - ${r}`)].join(
    '\n'
  );
}
