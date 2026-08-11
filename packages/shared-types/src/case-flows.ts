/**
 * Travel claim intake flows — the single source of truth for the guided
 * "Case" intake conversation (Etiqa TripCare-style bot experience).
 *
 * Consumed by:
 *  - case-service: server-side validation of each PATCH /cases/:id/answers
 *  - claimant-web: chat-style renderer (bot bubbles + typed inputs)
 *  - adjuster-portal: staff capture form + transcript/completeness display
 *
 * Channel-agnostic by design: a future WhatsApp or email adapter maps
 * `answerType` to channel-native prompts and drives the same step engine.
 */
import type { DocumentType, TravelClaimType } from './index';

/*
 * IMPORTANT: type-only import above. index.ts re-exports this module, so a
 * runtime value import of the enums would create an index ⇄ case-flows
 * circular evaluation — harmless under CJS (backend), but under native ESM
 * (Vite dev serving the source) this module evaluates first and the enum
 * objects are still undefined. The literal mirrors below carry the runtime
 * values; the casts keep them typed exactly as the enums.
 */
const TravelType = {
  FLIGHT_DELAY: 'FLIGHT_DELAY',
  LUGGAGE_DAMAGE: 'LUGGAGE_DAMAGE',
  LUGGAGE_LOSS: 'LUGGAGE_LOSS',
  TRIP_CANCELLATION: 'TRIP_CANCELLATION',
  MEDICAL: 'MEDICAL',
} as unknown as typeof import('./index').TravelClaimType;

const Doc = {
  AIRLINE_DELAY_CONFIRMATION: 'AIRLINE_DELAY_CONFIRMATION',
  BOARDING_PASS: 'BOARDING_PASS',
  FLIGHT_ITINERARY: 'FLIGHT_ITINERARY',
  PROPERTY_IRREGULARITY_REPORT: 'PROPERTY_IRREGULARITY_REPORT',
  BAGGAGE_TAG: 'BAGGAGE_TAG',
  DAMAGE_PHOTO: 'DAMAGE_PHOTO',
  PROOF_OF_OWNERSHIP: 'PROOF_OF_OWNERSHIP',
  MEDICAL_REPORT: 'MEDICAL_REPORT',
  TRAVEL_BOOKING_INVOICE: 'TRAVEL_BOOKING_INVOICE',
  OVERSEAS_MEDICAL_BILL: 'OVERSEAS_MEDICAL_BILL',
  PASSPORT: 'PASSPORT',
} as unknown as typeof import('./index').DocumentType;

export type AnswerValue = string | number | boolean;
export type CaseAnswers = Record<string, AnswerValue>;

/**
 * Prisma generates string-literal unions rather than TS enums, so helper
 * signatures accept either form ("FLIGHT_DELAY" literal or the enum member).
 */
export type TravelClaimTypeLike = TravelClaimType | `${TravelClaimType}`;
export type DocumentTypeLike = DocumentType | `${DocumentType}`;

export type AnswerType =
  | 'text'
  | 'date'
  | 'datetime'
  | 'number'
  | 'choice'
  | 'phone'
  | 'document'
  | 'confirm';

/** One predicate against a previously captured answer. */
export interface NextCondition {
  stepId: string;
  op: 'eq' | 'neq' | 'in' | 'notIn' | 'exists' | 'gt' | 'lt';
  /** Absent for `exists`; an array for `in` / `notIn`. */
  value?: AnswerValue | AnswerValue[];
}

/**
 * Where a step leads. Declarative rather than a callback, because a flow has
 * to survive a round trip through a database column and a visual editor — a
 * JS closure serialises to nothing and cannot be authored in a form.
 *
 * `branch` takes an array of conditions ANDed together. `switch` exists
 * separately because multi-way routing (a cause-of-loss list fanning out to
 * per-peril steps, which fire and flood will need) chains into an unreadable
 * ladder when expressed as nested binary branches, and renders as a plain
 * table in the editor when it is its own rule.
 */
export type NextRule =
  | { type: 'step'; stepId: string }
  | { type: 'end' }
  | { type: 'branch'; when: NextCondition[]; then: string | null; else: string | null }
  | {
      type: 'switch';
      /** Step whose answer selects the destination. */
      on: string;
      cases: Array<{ value: AnswerValue; goto: string }>;
      default: string | null;
    };

export interface FlowStep {
  id: string;
  /** Bot bubble copy shown to the claimant (British English). */
  prompt: string;
  /** Shorter label used by the staff form and the review summary. */
  label: string;
  answerType: AnswerType;
  choices?: Array<{ value: string; label: string }>;
  /** Present when answerType === 'document'. */
  documentType?: DocumentType;
  optional?: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    /**
     * Minimum characters of actual substance, for steps whose value is the
     * claimant's own account of what happened.
     *
     * A description is the one field an adjuster cannot reconstruct from
     * anything else, so "I don't know" being accepted is not a small loss —
     * the claim reaches vetting unusable and bounces back days later, when the
     * claimant has stopped thinking about it.
     */
    minLength?: number;
  };
  /**
   * Load-bearing outside the conversation: something elsewhere reads this
   * answer by step id. `incident-date` drives the CSP deadline flags,
   * `trip-start` is promoted to Claim.tripStartDate on conversion, and
   * `bank-account-number` keys the redaction set.
   *
   * Copy stays editable; the id and the step's existence do not. The publish
   * gate refuses a flow that has dropped one, because nothing else would
   * notice — the conversation runs, the claim looks healthy, and a regulatory
   * clock silently stops being computed.
   */
  system?: boolean;
  /** Where this step leads. */
  next: NextRule;
}

export interface CaseFlow {
  travelClaimType: TravelClaimType;
  entryStepId: string;
  steps: FlowStep[];
}

export const TRAVEL_CLAIM_TYPE_LABELS: Record<TravelClaimType, string> = {
  [TravelType.FLIGHT_DELAY]: 'Flight delay',
  [TravelType.LUGGAGE_DAMAGE]: 'Luggage damage',
  [TravelType.LUGGAGE_LOSS]: 'Luggage loss',
  [TravelType.TRIP_CANCELLATION]: 'Trip cancellation',
  [TravelType.MEDICAL]: 'Medical expenses',
};

/** Notification deadlines mirrored from typical Malaysian travel policy terms. */
export const NOTIFY_WITHIN_HOURS = 24;
export const CLAIM_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Shared step fragments
// ---------------------------------------------------------------------------

/** Steps every flow starts with, in order. `next` is wired by buildFlow(). */
const commonPrefix: Array<Omit<FlowStep, 'next'>> = [
  {
    id: 'policy-number',
    prompt:
      'Let us begin with your policy. What is your travel policy number? You can find it on your policy schedule or confirmation email. If you are not sure, type "skip".',
    label: 'Policy number',
    answerType: 'text',
    optional: true,
  },
  {
    id: 'trip-start',
    prompt: 'When did your trip begin?',
    label: 'Trip start date',
    answerType: 'date',
    system: true, // promoted to Claim.tripStartDate on conversion
  },
  {
    id: 'trip-end',
    prompt: 'And when does (or did) your trip end?',
    label: 'Trip end date',
    answerType: 'date',
  },
  {
    id: 'destination',
    prompt: 'Which country or destination were you travelling to?',
    label: 'Destination',
    answerType: 'text',
  },
  {
    id: 'incident-date',
    prompt: 'When did the incident happen? Please give the date and approximate time.',
    label: 'Incident date and time',
    answerType: 'datetime',
    system: true, // drives computeDeadlineFlags — notifiedLate / outOfWindow
  },
];

/** Steps every flow ends with (payout details + review), in order. */
const commonSuffix: Array<Omit<FlowStep, 'next'>> = [
  {
    id: 'bank-name',
    prompt:
      'Nearly done. For your payout, which bank is your account with? (e.g. Maybank, CIMB, Public Bank)',
    label: 'Bank name',
    answerType: 'text',
  },
  {
    id: 'bank-account-number',
    prompt: 'What is your bank account number?',
    label: 'Bank account number',
    answerType: 'text',
    validation: { pattern: '^[0-9]{6,20}$' },
    system: true, // keys SENSITIVE_ANSWER_STEPS — the redaction set is by step id
  },
  {
    id: 'bank-account-holder',
    prompt: 'And the account holder name, exactly as registered with the bank?',
    label: 'Account holder name',
    answerType: 'text',
  },
  {
    id: 'review',
    // Channel-neutral on purpose. "the summary below" was true only of the PWA,
    // which renders a panel under the chat; on a messaging thread there is no
    // below, and the bot pointed at something that did not exist. Channels with
    // no summary surface get the answers appended to this message instead —
    // see ChannelCapabilities.summaryPanel.
    prompt:
      'Thank you. Please review your details, then confirm to submit your claim request.',
    label: 'Review and confirm',
    answerType: 'confirm',
    system: true, // resolveNextStep and submit() both special-case this id
  },
];

const documentStep = (
  id: string,
  documentType: DocumentType,
  prompt: string,
  label: string,
  optional = false
): Omit<FlowStep, 'next'> => ({
  id,
  prompt,
  label,
  answerType: 'document',
  documentType,
  optional,
});

/**
 * Wire steps into a linear flow (each step's `next` points to the following
 * step), allowing individual overrides for branching.
 */
const buildFlow = (
  travelClaimType: TravelClaimType,
  middle: Array<Omit<FlowStep, 'next'>>,
  overrides: Record<string, NextRule> = {}
): CaseFlow => {
  const ordered = [...commonPrefix, ...middle, ...commonSuffix];
  const steps: FlowStep[] = ordered.map((step, index) => {
    if (step.id in overrides) return { ...step, next: overrides[step.id] };
    const following = ordered[index + 1]?.id;
    return {
      ...step,
      next: following ? { type: 'step', stepId: following } : { type: 'end' },
    };
  });
  return { travelClaimType, entryStepId: steps[0].id, steps };
};

// ---------------------------------------------------------------------------
// The five MSIG TPA travel flows
// ---------------------------------------------------------------------------

const flightDelayFlow = buildFlow(TravelType.FLIGHT_DELAY, [
  {
    id: 'airline',
    prompt: 'Which airline were you flying with?',
    label: 'Airline',
    answerType: 'text',
  },
  {
    id: 'flight-number',
    prompt: 'What was your flight number? (e.g. MH370, AK6042)',
    label: 'Flight number',
    answerType: 'text',
    validation: { pattern: '^[A-Za-z0-9]{2,3}\\s?[0-9]{1,4}[A-Za-z]?$' },
  },
  {
    id: 'scheduled-departure',
    prompt: 'What was the scheduled departure date and time?',
    label: 'Scheduled departure',
    answerType: 'datetime',
  },
  {
    id: 'actual-departure',
    prompt:
      'And when did the flight actually depart? If it was cancelled, give the departure time of the replacement flight.',
    label: 'Actual departure',
    answerType: 'datetime',
  },
  documentStep(
    'doc-airline-delay-confirmation',
    Doc.AIRLINE_DELAY_CONFIRMATION,
    'Please upload the airline’s written confirmation of the delay or cancellation.',
    'Airline delay confirmation'
  ),
  documentStep(
    'doc-boarding-pass',
    Doc.BOARDING_PASS,
    'Please upload your boarding pass for the delayed flight.',
    'Boarding pass'
  ),
  documentStep(
    'doc-flight-itinerary',
    Doc.FLIGHT_ITINERARY,
    'Please upload your e-ticket or booking confirmation.',
    'Flight itinerary'
  ),
]);

const luggageDamageFlow = buildFlow(TravelType.LUGGAGE_DAMAGE, [
  {
    id: 'airline',
    prompt: 'Which airline were you flying with when the damage occurred?',
    label: 'Airline',
    answerType: 'text',
  },
  {
    id: 'flight-number',
    prompt: 'What was your flight number?',
    label: 'Flight number',
    answerType: 'text',
    validation: { pattern: '^[A-Za-z0-9]{2,3}\\s?[0-9]{1,4}[A-Za-z]?$' },
  },
  {
    id: 'baggage-tag',
    prompt: 'What is the baggage tag number for the affected luggage?',
    label: 'Baggage tag number',
    answerType: 'text',
  },
  {
    id: 'damage-description',
    prompt: 'Please describe the damage to your luggage.',
    label: 'Damage description',
    answerType: 'text',
    validation: { minLength: 20 },
  },
  {
    id: 'estimated-amount',
    prompt: 'What is your estimated claim amount in Ringgit Malaysia (RM)?',
    label: 'Estimated amount (RM)',
    answerType: 'number',
    validation: { min: 0, max: 1000000 },
  },
  documentStep(
    'doc-pir',
    Doc.PROPERTY_IRREGULARITY_REPORT,
    'Please upload the Property Irregularity Report (PIR) issued by the airline. You can request it at the airline’s baggage services counter.',
    'Property Irregularity Report (PIR)'
  ),
  documentStep(
    'doc-baggage-tag',
    Doc.BAGGAGE_TAG,
    'Please upload a photo of the baggage tag.',
    'Baggage tag'
  ),
  documentStep(
    'doc-damage-photo',
    Doc.DAMAGE_PHOTO,
    'Please upload clear photographs of the damaged luggage.',
    'Damage photographs'
  ),
  documentStep(
    'doc-proof-of-ownership',
    Doc.PROOF_OF_OWNERSHIP,
    'If you have a receipt or proof of purchase for the luggage, please upload it. Otherwise type "skip".',
    'Proof of ownership',
    true
  ),
]);

const luggageLossFlow = buildFlow(TravelType.LUGGAGE_LOSS, [
  {
    id: 'airline',
    prompt: 'Which airline were you flying with when your luggage was lost?',
    label: 'Airline',
    answerType: 'text',
  },
  {
    id: 'flight-number',
    prompt: 'What was your flight number?',
    label: 'Flight number',
    answerType: 'text',
    validation: { pattern: '^[A-Za-z0-9]{2,3}\\s?[0-9]{1,4}[A-Za-z]?$' },
  },
  {
    id: 'baggage-tag',
    prompt: 'What is the baggage tag number for the lost luggage?',
    label: 'Baggage tag number',
    answerType: 'text',
  },
  {
    id: 'contents-description',
    prompt: 'Please list the main contents of the lost luggage and their approximate values.',
    label: 'Contents description',
    answerType: 'text',
    validation: { minLength: 20 },
  },
  {
    id: 'estimated-amount',
    prompt: 'What is your estimated claim amount in Ringgit Malaysia (RM)?',
    label: 'Estimated amount (RM)',
    answerType: 'number',
    validation: { min: 0, max: 1000000 },
  },
  documentStep(
    'doc-pir',
    Doc.PROPERTY_IRREGULARITY_REPORT,
    'Please upload the Property Irregularity Report (PIR) issued by the airline.',
    'Property Irregularity Report (PIR)'
  ),
  documentStep(
    'doc-baggage-tag',
    Doc.BAGGAGE_TAG,
    'Please upload a photo of the baggage tag or check-in receipt.',
    'Baggage tag'
  ),
  documentStep(
    'doc-proof-of-ownership',
    Doc.PROOF_OF_OWNERSHIP,
    'Please upload receipts or proof of ownership for the items you are claiming.',
    'Proof of ownership'
  ),
]);

const tripCancellationFlow = buildFlow(
  TravelType.TRIP_CANCELLATION,
  [
    {
      id: 'cancellation-reason',
      prompt: 'Why was your trip cancelled?',
      label: 'Cancellation reason',
      answerType: 'choice',
      choices: [
        { value: 'ILLNESS', label: 'Serious illness or injury' },
        { value: 'DEATH_OF_RELATIVE', label: 'Death of a close family member' },
        { value: 'NATURAL_DISASTER', label: 'Natural disaster at the destination' },
        { value: 'OTHER', label: 'Other reason' },
      ],
    },
    {
      id: 'estimated-amount',
      prompt:
        'What is the total non-refundable amount you are claiming, in Ringgit Malaysia (RM)?',
      label: 'Estimated amount (RM)',
      answerType: 'number',
      validation: { min: 0, max: 1000000 },
    },
    documentStep(
      'doc-medical-report',
      Doc.MEDICAL_REPORT,
      'As the cancellation was for medical reasons, please upload the medical report or certificate.',
      'Medical report'
    ),
    documentStep(
      'doc-booking-invoice',
      Doc.TRAVEL_BOOKING_INVOICE,
      'Please upload your booking invoices and any cancellation or refund correspondence.',
      'Booking invoices'
    ),
    documentStep(
      'doc-flight-itinerary',
      Doc.FLIGHT_ITINERARY,
      'Please upload the e-ticket or booking confirmation for the cancelled trip.',
      'Flight itinerary'
    ),
  ],
  {
    // Medical evidence is only requested when the reason is illness or death.
    'estimated-amount': {
      type: 'branch',
      when: [
        { stepId: 'cancellation-reason', op: 'in', value: ['ILLNESS', 'DEATH_OF_RELATIVE'] },
      ],
      then: 'doc-medical-report',
      else: 'doc-booking-invoice',
    },
  }
);

const medicalFlow = buildFlow(TravelType.MEDICAL, [
  {
    id: 'treatment-country',
    prompt: 'In which country did you receive treatment?',
    label: 'Treatment country',
    answerType: 'text',
  },
  {
    id: 'hospital-name',
    prompt: 'What is the name of the hospital or clinic that treated you?',
    label: 'Hospital / clinic',
    answerType: 'text',
  },
  {
    id: 'diagnosis-description',
    prompt: 'Please describe the illness or injury and the treatment you received.',
    label: 'Condition and treatment',
    answerType: 'text',
    validation: { minLength: 20 },
  },
  {
    id: 'estimated-amount',
    prompt: 'What is the total amount of your medical bills, in Ringgit Malaysia (RM)?',
    label: 'Estimated amount (RM)',
    answerType: 'number',
    validation: { min: 0, max: 5000000 },
  },
  documentStep(
    'doc-overseas-medical-bill',
    Doc.OVERSEAS_MEDICAL_BILL,
    'Please upload your itemised medical bills and receipts.',
    'Overseas medical bills'
  ),
  documentStep(
    'doc-medical-report',
    Doc.MEDICAL_REPORT,
    'Please upload the medical report or discharge summary from the treating hospital.',
    'Medical report'
  ),
  documentStep(
    'doc-passport',
    Doc.PASSPORT,
    'Please upload the passport pages showing your identity and travel entry/exit stamps.',
    'Passport'
  ),
  {
    id: 'medical-review-note',
    prompt:
      'Thank you. Please note that medical claims are reviewed personally by our claims specialists before being passed to your insurer — a member of the team may contact you for further details.',
    label: 'Specialist review notice',
    answerType: 'confirm',
  },
]);

export const CASE_FLOWS: Record<TravelClaimType, CaseFlow> = {
  [TravelType.FLIGHT_DELAY]: flightDelayFlow,
  [TravelType.LUGGAGE_DAMAGE]: luggageDamageFlow,
  [TravelType.LUGGAGE_LOSS]: luggageLossFlow,
  [TravelType.TRIP_CANCELLATION]: tripCancellationFlow,
  [TravelType.MEDICAL]: medicalFlow,
};

// ---------------------------------------------------------------------------
// Helpers — used identically by case-service and both frontends
// ---------------------------------------------------------------------------

export const getFlow = (type: TravelClaimTypeLike): CaseFlow =>
  CASE_FLOWS[type as TravelClaimType];

export const getStep = (flow: CaseFlow, stepId: string): FlowStep | undefined =>
  flow.steps.find(step => step.id === stepId);

/** Evaluate one condition against the answers captured so far. */
const testCondition = (condition: NextCondition, answers: CaseAnswers): boolean => {
  const actual = answers[condition.stepId];
  switch (condition.op) {
    case 'exists':
      return actual !== undefined && actual !== null && actual !== '';
    case 'eq':
      return actual === condition.value;
    case 'neq':
      return actual !== condition.value;
    case 'in':
      return Array.isArray(condition.value) && condition.value.includes(actual);
    case 'notIn':
      return Array.isArray(condition.value) && !condition.value.includes(actual);
    case 'gt':
      return Number(actual) > Number(condition.value);
    case 'lt':
      return Number(actual) < Number(condition.value);
    default:
      return false;
  }
};

/**
 * Resolve a NextRule to a step id, or null for the end of the flow.
 *
 * Exported because the publish gate walks rules statically and the chat
 * gateway evaluates them per turn — both need the same semantics, and a second
 * implementation is how a branch comes to behave differently in validation
 * than it does in the conversation.
 */
export const evaluateNext = (rule: NextRule, answers: CaseAnswers): string | null => {
  switch (rule.type) {
    case 'end':
      return null;
    case 'step':
      return rule.stepId;
    case 'branch':
      return rule.when.every(condition => testCondition(condition, answers))
        ? rule.then
        : rule.else;
    case 'switch': {
      const actual = answers[rule.on];
      const matched = rule.cases.find(entry => entry.value === actual);
      return matched ? matched.goto : rule.default;
    }
    default:
      return null;
  }
};

/**
 * Steps whose answer decides where the flow goes next.
 *
 * Editing one of these is not the same as fixing a typo. Changing a
 * cancellation reason from "natural disaster" to "illness" makes a medical
 * report necessary that was never asked for — so the conversation has to
 * re-walk from there rather than resume, and answers collected under the old
 * path may no longer apply.
 *
 * Derived from the rules rather than hand-listed: a new branch added in the
 * flow editor is covered the moment it is published, with nobody remembering
 * to update a list somewhere else.
 */
export const branchInputSteps = (flow: CaseFlow): Set<string> => {
  const inputs = new Set<string>();
  for (const step of flow.steps) {
    const rule = step.next;
    if (rule.type === 'branch') {
      for (const condition of rule.when) inputs.add(condition.stepId);
    } else if (rule.type === 'switch') {
      inputs.add(rule.on);
    }
  }
  return inputs;
};

/** Every step id a rule can reach — for static validation, ignoring answers. */
export const ruleTargets = (rule: NextRule): string[] => {
  switch (rule.type) {
    case 'step':
      return [rule.stepId];
    case 'branch':
      return [rule.then, rule.else].filter((id): id is string => id !== null);
    case 'switch':
      return [...rule.cases.map(entry => entry.goto), rule.default].filter(
        (id): id is string => id !== null
      );
    default:
      return [];
  }
};

/**
 * Resolve the next unanswered step after `stepId`. Steps whose answers are
 * already present (e.g. pre-filled by a SYSTEM-initiated case) are skipped.
 * Returns null when the flow is complete.
 */
export const resolveNextStep = (
  flow: CaseFlow,
  stepId: string,
  answers: CaseAnswers
): string | null => {
  let current = getStep(flow, stepId);
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.id)) return null; // guard against miswired cycles
    visited.add(current.id);
    const nextId = evaluateNext(current.next, answers);
    if (!nextId) return null;
    const nextStep = getStep(flow, nextId);
    if (!nextStep) return null;
    const answered = answers[nextStep.id] !== undefined && nextStep.id !== 'review';
    if (!answered) return nextStep.id;
    current = nextStep;
  }
  return null;
};

export interface AnswerValidation {
  valid: boolean;
  error?: string;
}

/**
 * What a claimant types to decline an optional step.
 *
 * Exported because the channel gateways have to recognise it *before* they
 * interpret an answer — a document step returns early looking for a file, so
 * without this it never reaches `validateAnswer` and an optional upload
 * becomes mandatory in practice.
 */
export const SKIP_VALUE = 'skip';

/**
 * Steps whose answer must never be stored in the clear.
 *
 * Shared rather than duplicated: the Case answer bag masks these before
 * persisting, and the conversation transcript has to mask the same ones. Two
 * lists would drift, and the drift would be invisible — a plaintext account
 * number in a column nobody thinks of as sensitive.
 */
export const SENSITIVE_ANSWER_STEPS: ReadonlySet<string> = new Set(['bank-account-number']);

/** The display mask a redacted answer carries. */
export const ANSWER_MASK_PREFIX = '••••';

/**
 * Things people type when they do not want to answer.
 *
 * Deliberately a small, literal list rather than a clever heuristic: rejecting
 * a genuine answer is worse than accepting a poor one, because the claimant is
 * standing in an airport and has no idea what we would accept instead. Only
 * matched on steps that declare a minLength, so it never touches a name or a
 * flight number.
 */
const NON_ANSWERS = new Set([
  'i dont know',
  "i don't know",
  'idk',
  'dont know',
  "don't know",
  'no idea',
  'not sure',
  'unsure',
  'n/a',
  'na',
  'nil',
  'none',
  'nothing',
  '-',
  'tak tahu',
  'entah',
]);

export const validateAnswer = (step: FlowStep, value: AnswerValue): AnswerValidation => {
  if (step.optional && typeof value === 'string' && value.trim().toLowerCase() === SKIP_VALUE) {
    return { valid: true };
  }
  switch (step.answerType) {
    case 'text':
    case 'phone': {
      if (typeof value !== 'string' || value.trim().length === 0) {
        return { valid: false, error: 'Please provide an answer.' };
      }
      const text = value.trim();

      // Length alone would not catch these — "I don't know" is longer than
      // plenty of good answers, and "nil" is shorter than most bad ones.
      if (step.validation?.minLength !== undefined) {
        if (NON_ANSWERS.has(text.toLowerCase().replace(/[.!?]+$/, ''))) {
          return {
            valid: false,
            error:
              'We need your own description here — it is the part nobody else can fill in ' +
              'for you. Even a rough one helps, for example what is damaged and how.',
          };
        }
        if (text.length < step.validation.minLength) {
          return {
            valid: false,
            error: `Please give a little more detail — around ${step.validation.minLength} characters or more.`,
          };
        }
      }
      if (step.validation?.pattern && !new RegExp(step.validation.pattern).test(value.trim())) {
        return { valid: false, error: 'That does not look right — please check the format and try again.' };
      }
      return { valid: true };
    }
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(num)) return { valid: false, error: 'Please enter a number.' };
      if (step.validation?.min !== undefined && num < step.validation.min) {
        return { valid: false, error: `Please enter a value of at least ${step.validation.min}.` };
      }
      if (step.validation?.max !== undefined && num > step.validation.max) {
        return { valid: false, error: `Please enter a value no greater than ${step.validation.max}.` };
      }
      return { valid: true };
    }
    case 'date':
    case 'datetime': {
      const text = String(value).trim();

      // Slash and dot forms are refused outright rather than handed to
      // `new Date()`, which reads them month-first. "06/07/2026" would parse
      // happily as 7 June when a Malaysian claimant meant 6 July — a wrong
      // incident date that moves the CSP deadline flags with nothing to see.
      //
      // Channels where the claimant types free text convert to ISO first, via
      // `parseTextDate` in channel-capabilities. Everything else already sends
      // ISO: the PWA's date control, the staff form and the FNOL parser.
      if (/^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}/.test(text)) {
        return {
          valid: false,
          error: 'Please give the date as DD/MM/YYYY, for example 16/06/2026.',
        };
      }

      const date = new Date(text);
      if (Number.isNaN(date.getTime())) {
        return { valid: false, error: 'Please provide a valid date.' };
      }
      return { valid: true };
    }
    case 'choice': {
      if (!step.choices?.some(choice => choice.value === value)) {
        return { valid: false, error: 'Please choose one of the options.' };
      }
      return { valid: true };
    }
    case 'document': {
      // Value is the uploaded CaseDocument id (or "skip" for optional docs).
      if (typeof value !== 'string' || value.trim().length === 0) {
        return { valid: false, error: 'Please upload the requested document.' };
      }
      return { valid: true };
    }
    case 'confirm': {
      if (value !== true && value !== 'true') {
        return { valid: false, error: 'Please confirm to continue.' };
      }
      return { valid: true };
    }
    default:
      return { valid: false, error: 'Unsupported answer type.' };
  }
};

export interface DeadlineFlags {
  notifiedLate: boolean;
  outOfWindow: boolean;
  warnings: string[];
}

/**
 * 24-hour notification / 30-day claim-window rules, surfaced as warnings
 * (never blockers — rejection stays a human decision).
 */
export const computeDeadlineFlags = (
  incidentDate: Date | string,
  now: Date = new Date()
): DeadlineFlags => {
  const incident = new Date(incidentDate);
  const hoursSince = (now.getTime() - incident.getTime()) / (1000 * 60 * 60);
  const notifiedLate = hoursSince > NOTIFY_WITHIN_HOURS;
  const outOfWindow = hoursSince > CLAIM_WINDOW_DAYS * 24;
  const warnings: string[] = [];
  if (outOfWindow) {
    warnings.push(
      `This incident happened more than ${CLAIM_WINDOW_DAYS} days ago. Claims should be submitted within ${CLAIM_WINDOW_DAYS} days — your request will still be recorded, but it may be declined by the insurer.`
    );
  } else if (notifiedLate) {
    warnings.push(
      `Please note that incidents should be reported within ${NOTIFY_WITHIN_HOURS} hours. Your request will still be recorded, but late notification may affect the outcome.`
    );
  }
  return { notifiedLate, outOfWindow, warnings };
};

export interface CompletenessSummary {
  mandatoryTotal: number;
  mandatoryUploaded: number;
  optionalTotal: number;
  optionalUploaded: number;
  percent: number;
  missingMandatory: DocumentTypeLike[];
}

/** Document completeness vs the EvidenceRequirement checklist for a subtype. */
export const computeCompleteness = (
  uploadedTypes: DocumentTypeLike[],
  requirements: Array<{ documentType: DocumentTypeLike; isMandatory: boolean }>
): CompletenessSummary => {
  const uploaded = new Set(uploadedTypes);
  const mandatory = requirements.filter(req => req.isMandatory);
  const optional = requirements.filter(req => !req.isMandatory);
  const mandatoryUploaded = mandatory.filter(req => uploaded.has(req.documentType));
  const missingMandatory = mandatory
    .filter(req => !uploaded.has(req.documentType))
    .map(req => req.documentType);
  return {
    mandatoryTotal: mandatory.length,
    mandatoryUploaded: mandatoryUploaded.length,
    optionalTotal: optional.length,
    optionalUploaded: optional.filter(req => uploaded.has(req.documentType)).length,
    percent: mandatory.length === 0 ? 100 : Math.round((mandatoryUploaded.length / mandatory.length) * 100),
    missingMandatory,
  };
};
