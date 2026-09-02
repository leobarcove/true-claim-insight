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

/**
 * Id of the final confirmation step.
 *
 * A named constant because three separate places outside the flow definition
 * key on it — `resolveNextStep`, `submit()` and the completeness check — and a
 * bare `'review'` in each gives no hint that they must agree.
 */
export const REVIEW_STEP_ID = 'review';

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
  choices?: Array<{ value: string; label: string; title?: string; description?: string }>;
  /**
   * A choice step that also accepts a typed answer.
   *
   * The escape hatch for any list that is *common* rather than *complete* —
   * airlines, destinations, banks. Without it a claimant whose answer is not
   * on the list is stuck at a question they can see is wrong for them, and
   * the documented failure mode of guided bots is exactly this: an option set
   * that looks total and is not.
   *
   * A typed value is stored verbatim, so `value in choices` is what
   * distinguishes a code from free text downstream. Do not set it on a step
   * whose answer drives a branch — `branchInputSteps` routes on exact values,
   * and free text would fall to the default arm without anyone noticing.
   */
  allowOther?: boolean;
  /** Present when answerType === 'document'. */
  documentType?: DocumentType;
  /**
   * Extra guidance shown under the prompt: where to find the thing, what an
   * acceptable version of it looks like.
   *
   * Separate from `prompt` because the two have different jobs and different
   * audiences. The prompt is the question, and it is what the staff capture
   * form and the review summary show; this is the bit a claimant standing in
   * an airport needs and an adjuster at a desk does not. Keeping them apart
   * also means a channel too tight to carry both can drop this one.
   */
  hint?: string;
  optional?: boolean;
  /**
   * Refuse a date after today. Set on steps recording something that has
   * already occurred — an incident date above all, because a future one
   * silently suppresses the CSP deadline flags rather than failing loudly.
   */
  notFuture?: boolean;
  /**
   * This step is the final confirmation: answering it submits the Case.
   *
   * Explicit rather than inferred from `answerType === 'confirm'`, because a
   * confirm step is not necessarily a review. The medical flow has two — a
   * mid-flow specialist-review *notice* and the actual review — and reading
   * "confirm" as "the claimant just submitted" was safe there only by the
   * accident that the notice sits mid-flow. It also meant the notice had the
   * whole answer summary pasted underneath it.
   */
  isReview?: boolean;
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
    /**
     * Replaces the generic "that does not look right" rejection with one that
     * says what right looks like.
     *
     * The default names no rule, so a claimant who typed a bank account as
     * "1234-5678" is told only that it is wrong — and the obvious repair, to
     * retype the same thing more carefully, fails identically. An error that
     * cannot be acted on is a loop, and the loop is at the payout step.
     */
    patternError?: string;
    /**
     * Replaces the "we need your own description" rejection on steps where
     * `minLength` is guarding something that is not a description.
     *
     * The default wording tells the claimant their answer lacks detail, which
     * is right for an account of what happened and absurd for a name — nobody
     * should be asked to describe their own name in more depth.
     */
    substanceError?: string;
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

/**
 * What each claim type covers, in the claimant's words.
 *
 * A label alone makes somebody guess: a missed connection is not obviously a
 * "flight delay", and a bag the airline never returned is not obviously
 * "luggage loss" rather than damage. Choosing wrong is expensive here — the
 * type pins the flow to the case and every question after it, and there is no
 * turn that re-pins it.
 *
 * Kept beside the labels, and put on the choice itself, so the help arrives on
 * every channel that asks the question rather than only the one it was written
 * for.
 */
export const TRAVEL_CLAIM_TYPE_DESCRIPTIONS: Record<TravelClaimType, string> = {
  [TravelType.FLIGHT_DELAY]: 'Delayed, cancelled or missed connection',
  [TravelType.LUGGAGE_DAMAGE]: 'Bag or contents damaged in transit',
  [TravelType.LUGGAGE_LOSS]: 'Bag not returned by the airline',
  [TravelType.TRIP_CANCELLATION]: 'Illness, bereavement, disaster or other reason',
  [TravelType.MEDICAL]: 'Hospital or clinic bills abroad',
};

/** Notification deadlines mirrored from typical Malaysian travel policy terms. */
export const NOTIFY_WITHIN_HOURS = 24;
export const CLAIM_WINDOW_DAYS = 30;

// ---------------------------------------------------------------------------
// Bounded answer sets
// ---------------------------------------------------------------------------

/*
 * Three questions used to be free text, and a real WhatsApp intake answered
 * all three with abbreviations nothing downstream can use: destination "SG",
 * airline "MAS", bank "CIMB". An adjuster can guess; a payout file and a
 * flight-delay lookup cannot.
 *
 * Every one of these steps keeps `allowOther`. Offering a list and refusing
 * anything outside it is the classic conversational-form failure — a claimant
 * flying a carrier we did not think of has no way past the question, and the
 * cost of that is the whole claim, not one poor answer.
 *
 * ORDER IS LOAD-BEARING. Only the first `CHOICE_DISPLAY_MAX` entries are
 * offered as taps; everything after is reachable by typing. The cap is a
 * usability limit rather than a channel one — Telegram will render a hundred
 * buttons and nobody reads them.
 */

/**
 * Where a payout is sent.
 *
 * The stored value is a slug, deliberately **not** a SWIFT/BIC or a DuitNow
 * participant code. Those are properties of a payment rail we have not built
 * yet, they differ per rail, and an answer already recorded against a live
 * claim must not turn out to have been the wrong identifier for whichever rail
 * is chosen. One mapping table, written when payouts are, converts these.
 *
 * Islamic subsidiaries are not listed separately: a claimant reads the brand
 * on their card, and "CIMB" versus "CIMB Islamic" is a distinction the payout
 * rail resolves from the account number, not one to make a stressed claimant
 * choose between.
 */
export const BANK_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'MAYBANK', label: 'Maybank' },
  { value: 'CIMB', label: 'CIMB Bank' },
  { value: 'PUBLIC_BANK', label: 'Public Bank' },
  { value: 'RHB', label: 'RHB Bank' },
  { value: 'HONG_LEONG', label: 'Hong Leong Bank' },
  { value: 'AMBANK', label: 'AmBank' },
  { value: 'BANK_ISLAM', label: 'Bank Islam' },
  { value: 'BSN', label: 'Bank Simpanan Nasional' },
  // Below the fold — typed, not tapped.
  { value: 'BANK_RAKYAT', label: 'Bank Rakyat' },
  { value: 'ALLIANCE', label: 'Alliance Bank' },
  { value: 'AFFIN', label: 'Affin Bank' },
  { value: 'OCBC', label: 'OCBC Bank' },
  { value: 'HSBC', label: 'HSBC Bank Malaysia' },
  { value: 'UOB', label: 'UOB Malaysia' },
  { value: 'STANDARD_CHARTERED', label: 'Standard Chartered' },
  { value: 'BANK_MUAMALAT', label: 'Bank Muamalat' },
  { value: 'AGROBANK', label: 'Agrobank' },
  { value: 'MBSB', label: 'MBSB Bank' },
  { value: 'AL_RAJHI', label: 'Al Rajhi Bank' },
  { value: 'KFH', label: 'Kuwait Finance House' },
  { value: 'CITIBANK', label: 'Citibank' },
];

/**
 * Carriers, keyed by IATA code.
 *
 * IATA rather than ICAO for two reasons. It is what the claimant is holding —
 * the boarding pass and the booking email both print it — and it is the prefix
 * of the flight number the very next step already validates, so "MH" against
 * "MH168" is a consistency check available for free. ICAO ("MAS") is an
 * operational code a passenger never sees, which is exactly why a claimant
 * typing it unprompted is ambiguous.
 */
export const AIRLINE_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'MH', label: 'Malaysia Airlines' },
  { value: 'AK', label: 'AirAsia' },
  { value: 'D7', label: 'AirAsia X' },
  { value: 'OD', label: 'Batik Air Malaysia' },
  { value: 'FY', label: 'Firefly' },
  { value: 'SQ', label: 'Singapore Airlines' },
  { value: 'TR', label: 'Scoot' },
  { value: 'CX', label: 'Cathay Pacific' },
  // Below the fold — typed, not tapped.
  { value: 'EK', label: 'Emirates' },
  { value: 'QR', label: 'Qatar Airways' },
  { value: 'TG', label: 'Thai Airways' },
  { value: 'VJ', label: 'VietJet Air' },
  { value: 'VN', label: 'Vietnam Airlines' },
  { value: 'GA', label: 'Garuda Indonesia' },
  { value: 'JL', label: 'Japan Airlines' },
  { value: 'NH', label: 'ANA' },
  { value: 'KE', label: 'Korean Air' },
  { value: 'BR', label: 'EVA Air' },
  { value: 'CI', label: 'China Airlines' },
  { value: 'MF', label: 'Xiamen Air' },
  { value: 'QZ', label: 'Indonesia AirAsia' },
  { value: 'PR', label: 'Philippine Airlines' },
];

/**
 * Destinations, keyed by ISO 3166-1 alpha-2.
 *
 * A published standard rather than our own list, so the value stays meaningful
 * to anything it is ever handed to. The claimant who typed "SG" had in fact
 * written the correct code — the problem was that nothing said so, and "SG"
 * from a free-text box could equally have been a typo.
 */
export const DESTINATION_CHOICES: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'SG', label: 'Singapore' },
  { value: 'TH', label: 'Thailand' },
  { value: 'ID', label: 'Indonesia' },
  { value: 'JP', label: 'Japan' },
  { value: 'VN', label: 'Vietnam' },
  { value: 'AU', label: 'Australia' },
  { value: 'KR', label: 'South Korea' },
  { value: 'CN', label: 'China' },
  // Below the fold — typed, not tapped.
  { value: 'TW', label: 'Taiwan' },
  { value: 'HK', label: 'Hong Kong' },
  { value: 'PH', label: 'Philippines' },
  { value: 'IN', label: 'India' },
  { value: 'KH', label: 'Cambodia' },
  { value: 'LA', label: 'Laos' },
  { value: 'MM', label: 'Myanmar' },
  { value: 'BN', label: 'Brunei' },
  { value: 'NZ', label: 'New Zealand' },
  { value: 'AE', label: 'United Arab Emirates' },
  { value: 'SA', label: 'Saudi Arabia' },
  { value: 'TR', label: 'Türkiye' },
  { value: 'GB', label: 'United Kingdom' },
  { value: 'FR', label: 'France' },
  { value: 'IT', label: 'Italy' },
  { value: 'DE', label: 'Germany' },
  { value: 'CH', label: 'Switzerland' },
  { value: 'NL', label: 'Netherlands' },
  { value: 'ES', label: 'Spain' },
  { value: 'US', label: 'United States' },
  { value: 'CA', label: 'Canada' },
  { value: 'EG', label: 'Egypt' },
  { value: 'ZA', label: 'South Africa' },
];

// ---------------------------------------------------------------------------
// Shared step fragments
// ---------------------------------------------------------------------------

/** Steps every flow starts with, in order. `next` is wired by buildFlow(). */
const commonPrefix: Array<Omit<FlowStep, 'next'>> = [
  {
    id: 'claimant-name',
    // Asked rather than derived, because there is nothing to derive it from: a
    // messaging claimant is known only by a phone number the platform vouched
    // for, the policy number is optional and frequently skipped, and no eKYC
    // vendor is integrated. Without this the claim reaches an adjuster with no
    // name on it at all — nothing for AMLA screening to screen, and no way to
    // recognise the same person claiming twice.
    //
    // "as it appears on your IC or passport" earns its length: the name has to
    // match the documents uploaded later and the account being paid, and a
    // first name alone does none of that.
    prompt:
      'First, what is your full name, as it appears on your IC or passport?',
    label: 'Full name',
    answerType: 'text',
    // Two characters, not the usual description threshold: "Ng" is a complete
    // Malaysian surname and a real claimant should never be told their own
    // name is too short.
    validation: {
      minLength: 2,
      substanceError: 'Please give your name as it is written on your IC or passport.',
    },
    system: true, // promoted to Claimant.fullName on conversion
  },
  {
    id: 'policy-number',
    prompt: 'What is your travel policy number?',
    hint:
      'It is on your policy schedule or the confirmation email you were sent when you bought the cover. ' +
      'If you cannot find it, type "skip" — our team will look it up for you.',
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
    prompt: 'Which country were you travelling to?',
    hint: 'Tap your destination below, or type the country name if it is not listed.',
    label: 'Destination',
    answerType: 'choice',
    choices: [...DESTINATION_CHOICES],
    allowOther: true,
  },
  {
    id: 'incident-date',
    prompt: 'When did the incident happen? Please give the date and approximate time.',
    label: 'Incident date and time',
    answerType: 'datetime',
    system: true, // drives computeDeadlineFlags — notifiedLate / outOfWindow
    notFuture: true, // a future date suppresses those very flags, silently
  },
];

/** Steps every flow ends with (payout details + review), in order. */
const commonSuffix: Array<Omit<FlowStep, 'next'>> = [
  {
    id: 'bank-name',
    // Reassurance, because of where this is being asked. Three questions for
    // a payout account, in a chat, is the exact shape of a scam — and a
    // cautious claimant stopping here is a claim lost at the last step. What
    // the copy asserts is true: the number is encrypted at rest and staff
    // screens show only the last four digits.
    prompt:
      'Nearly done — the last part is where to send your payout.\n\n' +
      'Your account number is encrypted and our team only ever sees the last four digits. ' +
      'We will never ask you to pay us anything.\n\n' +
      'Which bank is your account with?',
    hint: 'Tap your bank below, or type its name if it is not listed.',
    label: 'Bank name',
    answerType: 'choice',
    choices: [...BANK_CHOICES],
    allowOther: true,
  },
  {
    id: 'bank-account-number',
    prompt: 'What is your bank account number?',
    hint: 'Numbers only — no spaces or dashes.',
    label: 'Bank account number',
    answerType: 'text',
    validation: {
      pattern: '^[0-9]{6,20}$',
      // The generic rejection told a claimant their account number was wrong
      // without saying why, at the last step before submission, with the
      // obvious repair — retyping it the same way — failing identically.
      patternError:
        'Please type the account number using numbers only, with no spaces or dashes.',
    },
    system: true, // keys SENSITIVE_ANSWER_STEPS — the redaction set is by step id
  },
  {
    id: 'bank-account-holder',
    prompt: 'And the account holder name, exactly as registered with the bank?',
    hint: 'If the account is in someone else’s name, give their name here — we will ask about it later.',
    label: 'Account holder name',
    answerType: 'text',
  },
  {
    id: REVIEW_STEP_ID,
    isReview: true,
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

/**
 * `hint` is mandatory here, unlike on `FlowStep` generally.
 *
 * A document step is the one place a claimant is asked for something they may
 * not have, may not recognise by the name we call it, and cannot invent. The
 * flow used to name the artefact and stop — "the Property Irregularity Report"
 * is what the airline calls it and not what the claimant was handed. Naming a
 * thing is not the same as telling someone where to find it, so the parameter
 * is positional and required rather than optional and forgotten.
 */
const documentStep = (
  id: string,
  documentType: DocumentType,
  prompt: string,
  label: string,
  hint: string,
  optional = false
): Omit<FlowStep, 'next'> => ({
  id,
  prompt,
  hint,
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
    hint: 'Tap your airline below, or type its name if it is not listed.',
    label: 'Airline',
    answerType: 'choice',
    choices: [...AIRLINE_CHOICES],
    allowOther: true,
  },
  {
    id: 'flight-number',
    prompt: 'What was your flight number?',
    hint: 'The letters and numbers on your boarding pass, for example MH168 or AK6042.',
    label: 'Flight number',
    answerType: 'text',
    validation: {
      pattern: '^[A-Za-z0-9]{2,3}\\s?[0-9]{1,4}[A-Za-z]?$',
      patternError:
        'A flight number is two or three letters or digits followed by up to four numbers — ' +
        'for example MH168 or AK6042. You will find it on your boarding pass.',
    },
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
    'Airline delay confirmation',
    'This is the email, SMS or printed slip from the airline saying your flight was delayed ' +
    'or cancelled. A clear photo or screenshot is fine.',
  ),
  documentStep(
    'doc-boarding-pass',
    Doc.BOARDING_PASS,
    'Please upload your boarding pass for the delayed flight.',
    'Boarding pass',
    'The paper stub, or the pass saved in your phone. ' +
    'A clear photo or screenshot is fine.',
  ),
  documentStep(
    'doc-flight-itinerary',
    Doc.FLIGHT_ITINERARY,
    'Please upload your e-ticket or booking confirmation.',
    'Flight itinerary',
    'The email the airline or travel agent sent you when you booked. ' +
    'A clear photo or screenshot is fine.',
  ),
]);

const luggageDamageFlow = buildFlow(TravelType.LUGGAGE_DAMAGE, [
  {
    id: 'airline',
    prompt: 'Which airline were you flying with when the damage occurred?',
    hint: 'Tap your airline below, or type its name if it is not listed.',
    label: 'Airline',
    answerType: 'choice',
    choices: [...AIRLINE_CHOICES],
    allowOther: true,
  },
  {
    id: 'flight-number',
    prompt: 'What was your flight number?',
    hint: 'The letters and numbers on your boarding pass, for example MH168 or AK6042.',
    label: 'Flight number',
    answerType: 'text',
    validation: {
      pattern: '^[A-Za-z0-9]{2,3}\\s?[0-9]{1,4}[A-Za-z]?$',
      patternError:
        'A flight number is two or three letters or digits followed by up to four numbers — ' +
        'for example MH168 or AK6042. You will find it on your boarding pass.',
    },
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
    'Please send the baggage report the airline issued.',
    'Airline baggage report (PIR)',
    'The form the airline gave you at the baggage counter when you reported the problem — ' +
    'it may be called a PIR or a baggage irregularity form. A clear photo or screenshot is fine.',
  ),
  documentStep(
    'doc-baggage-tag',
    Doc.BAGGAGE_TAG,
    'Please upload a photo of the baggage tag.',
    'Baggage tag',
    'The sticker with the barcode, usually stuck to your ticket or passport at check-in. ' +
    'A clear photo or screenshot is fine.',
  ),
  documentStep(
    'doc-damage-photo',
    Doc.DAMAGE_PHOTO,
    'Please upload clear photographs of the damaged luggage.',
    'Damage photographs',
    'Take them in good light: one of the whole bag, then a close-up of each damaged part. ' +
    'Several photos are better than one.',
  ),
  documentStep(
    'doc-proof-of-ownership',
    Doc.PROOF_OF_OWNERSHIP,
    'If you have a receipt or proof of purchase for the luggage, please send it.',
    'Proof of ownership',
    'A receipt, a line on a bank or card statement, or the original box or warranty card. ' +
    'A clear photo or screenshot is fine.',
    true
  ),
]);

const luggageLossFlow = buildFlow(TravelType.LUGGAGE_LOSS, [
  {
    id: 'airline',
    prompt: 'Which airline were you flying with when your luggage was lost?',
    hint: 'Tap your airline below, or type its name if it is not listed.',
    label: 'Airline',
    answerType: 'choice',
    choices: [...AIRLINE_CHOICES],
    allowOther: true,
  },
  {
    id: 'flight-number',
    prompt: 'What was your flight number?',
    hint: 'The letters and numbers on your boarding pass, for example MH168 or AK6042.',
    label: 'Flight number',
    answerType: 'text',
    validation: {
      pattern: '^[A-Za-z0-9]{2,3}\\s?[0-9]{1,4}[A-Za-z]?$',
      patternError:
        'A flight number is two or three letters or digits followed by up to four numbers — ' +
        'for example MH168 or AK6042. You will find it on your boarding pass.',
    },
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
    'Please send the baggage report the airline issued.',
    'Airline baggage report (PIR)',
    'The form the airline gave you at the baggage counter when you reported the problem — ' +
    'it may be called a PIR or a baggage irregularity form. A clear photo or screenshot is fine.',
  ),
  documentStep(
    'doc-baggage-tag',
    Doc.BAGGAGE_TAG,
    'Please upload a photo of the baggage tag or check-in receipt.',
    'Baggage tag',
    'The sticker with the barcode, usually stuck to your ticket or passport at check-in. ' +
    'A clear photo or screenshot is fine.',
  ),
  documentStep(
    'doc-proof-of-ownership',
    Doc.PROOF_OF_OWNERSHIP,
    'Please upload receipts or proof of ownership for the items you are claiming.',
    'Proof of ownership',
    'A receipt, a line on a bank or card statement, or the original box or warranty card. ' +
    'A clear photo or screenshot is fine.',
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
      'Medical report',
      'The letter, certificate or discharge summary from the doctor or hospital who treated you. ' +
      'A clear photo or screenshot is fine.',
    ),
    documentStep(
      'doc-booking-invoice',
      Doc.TRAVEL_BOOKING_INVOICE,
      'Please upload your booking invoices and any cancellation or refund correspondence.',
      'Booking invoices',
      'Your booking invoices, plus any email showing what was refunded and what was not. ' +
      'A clear photo or screenshot is fine.',
    ),
    documentStep(
      'doc-flight-itinerary',
      Doc.FLIGHT_ITINERARY,
      'Please upload the e-ticket or booking confirmation for the cancelled trip.',
      'Flight itinerary',
      'The email the airline or travel agent sent you when you booked. ' +
      'A clear photo or screenshot is fine.',
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
    hint: 'Tap the country below, or type its name if it is not listed.',
    label: 'Treatment country',
    answerType: 'choice',
    choices: [...DESTINATION_CHOICES],
    allowOther: true,
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
    'Overseas medical bills',
    'The itemised bills and receipts — the ones listing each treatment and what it cost. ' +
    'A clear photo or screenshot is fine.',
  ),
  documentStep(
    'doc-medical-report',
    Doc.MEDICAL_REPORT,
    'Please upload the medical report or discharge summary from the treating hospital.',
    'Medical report',
    'The letter, certificate or discharge summary from the doctor or hospital who treated you. ' +
    'A clear photo or screenshot is fine.',
  ),
  documentStep(
    'doc-passport',
    Doc.PASSPORT,
    'Please upload the passport pages showing your identity and travel entry/exit stamps.',
    'Passport',
    'The photo page, plus the pages stamped when you entered and left the country. ' +
    'A clear photo or screenshot is fine.',
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

/**
 * Put `isReview` back on a stored flow that was published before the flag
 * existed.
 *
 * A Case walks the flow *version it pinned*, loaded from the database — so
 * adding a field to the definition in this file does not reach any claim
 * already in flight, and every platform flow was published without it. The
 * absence is not cosmetic: the review step stops being recognised as one, so
 * the answer summary is never attached (the claimant is asked to confirm
 * details they cannot see) and submission refuses to fire, handing a finished
 * claim to an agent as "ran out of steps without reaching a review".
 *
 * Repaired by step id against the reference definition, never by looking for
 * `answerType === 'confirm'`: the medical flow has two confirm steps, and
 * choosing the wrong one is the exact failure `isReview` was introduced to
 * prevent. `REVIEW_STEP_ID` is the fallback because the publish gate already
 * requires that id to exist and be reachable in any flow it accepts.
 *
 * A no-op once the stored rows carry the flag, so it stays correct rather than
 * becoming a second source of truth.
 */
export const restoreReviewFlag = (flow: CaseFlow, reference?: CaseFlow): CaseFlow => {
  if (flow.steps.some(step => step.isReview)) return flow;

  const fromReference = new Set(
    (reference?.steps ?? []).filter(step => step.isReview).map(step => step.id)
  );
  const isTheReview = (step: FlowStep): boolean =>
    fromReference.size > 0 ? fromReference.has(step.id) : step.id === REVIEW_STEP_ID;

  if (!flow.steps.some(isTheReview)) return flow;

  return {
    ...flow,
    steps: flow.steps.map(step => (isTheReview(step) ? { ...step, isReview: true } : step)),
  };
};

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
/**
 * The steps this claimant's answers actually lead through.
 *
 * Distinct from the publish gate's `reachableSteps`, which follows *every*
 * branch to prove no step is orphaned. This follows only the branch the
 * answers select, which is what "the claim as it stands" means.
 *
 * Needed because editing a branch input changes the path retroactively. A
 * claimant who switches a cancellation reason from illness to a natural
 * disaster leaves a medical report attached to a claim that no longer asks
 * for one — and an adjuster reading it sees evidence that contradicts the
 * claim. What was uploaded is never deleted (PD 12.8); it is simply no longer
 * presented as part of the live claim.
 */
export const pathSteps = (flow: CaseFlow, answers: CaseAnswers): Set<string> => {
  const onPath = new Set<string>();
  let current: FlowStep | undefined = getStep(flow, flow.entryStepId);

  while (current && !onPath.has(current.id)) {
    onPath.add(current.id);
    const nextId = evaluateNext(current.next, answers);
    current = nextId ? getStep(flow, nextId) : undefined;
  }
  return onPath;
};

/**
 * Mandatory steps on the claimant's actual path that have no answer.
 *
 * Walks the same route as `pathSteps`, so a branch never taken is never
 * demanded. The review is excluded: it is answered *by* submitting.
 *
 * Shared by the submit guard and the conversation, so the two cannot disagree
 * about what "complete" means — the failure that produces is a claimant told
 * at the final step that something is missing, by a bot with no way to ask for
 * it. That is reachable whenever a published flow gains a required step while
 * claims are already in flight, which is not hypothetical: it happens on every
 * structural flow change.
 */
export const missingSteps = (flow: CaseFlow, answers: CaseAnswers): FlowStep[] => {
  const missing: FlowStep[] = [];
  const seen = new Set<string>();
  let stepId: string | null = flow.entryStepId;

  while (stepId && !seen.has(stepId)) {
    seen.add(stepId);
    const step: FlowStep | undefined = getStep(flow, stepId);
    if (!step) break;
    if (!step.isReview && !step.optional && answers[step.id] === undefined) {
      missing.push(step);
    }
    stepId = evaluateNext(step.next, answers);
  }
  return missing;
};

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
    const answered = answers[nextStep.id] !== undefined && nextStep.id !== REVIEW_STEP_ID;
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
/**
 * Read an amount the way a Malaysian claimant types one.
 *
 * `Number()` alone was wrong in both directions: `Number('   ')` is **0**, so
 * a blank-looking message recorded a zero claim amount with no error at all,
 * and `Number('RM1,200')` is NaN, so the most natural way to write a sum was
 * refused with a message that did not say why.
 *
 * Currency prefix and thousands separators are stripped; anything still
 * unreadable stays NaN for the validator to refuse.
 */
export function parseAmount(raw: string): number {
  const cleaned = raw.trim().replace(/^rm\s*/i, '').replace(/,/g, '').trim();
  if (cleaned === '') return NaN;
  return Number(cleaned);
}

/**
 * A label lowered into running prose without flattening its acronyms.
 *
 * Word-by-word rather than a whole-string `toLowerCase`, because the only
 * tokens that must survive are the ones that are already all capitals.
 */
const sentenceCase = (label: string): string =>
  label
    .split(' ')
    .map(word => {
      const bare = word.replace(/[()]/g, '');
      const isAcronym = bare.length > 1 && bare === bare.toUpperCase() && /[A-Z]/.test(bare);
      return isAcronym ? word : word.toLowerCase();
    })
    .join(' ');

/**
 * What a claimant should go and find before starting.
 *
 * The single most useful thing a form can tell someone, and this conversation
 * did not: they met "upload the Property Irregularity Report" at question
 * eleven with nothing to hand, and their choices were to abandon or to skip
 * something the claim needs. Derived from the flow rather than written per
 * line, so a flow edited in the authoring tool cannot promise the wrong list.
 */
export const whatYouWillNeed = (flow: CaseFlow): string[] => {
  const needs: string[] = [];
  if (flow.steps.some(step => step.id === 'policy-number')) {
    needs.push('your travel policy number');
  }
  for (const step of flow.steps) {
    // Lower-cased to sit in a sentence-style list, except for acronyms, which
    // read as typos in lower case — "airline baggage report (pir)" looks like a
    // mistake in the first message a claimant gets.
    if (step.answerType === 'document') needs.push(sentenceCase(step.label));
  }
  if (flow.steps.some(step => step.id === 'bank-account-number')) {
    needs.push('your bank details for the payout');
  }
  return needs;
};

export const SKIP_VALUE = 'skip';

/**
 * What a claimant types when they will have the document, but not today.
 *
 * Distinct from `skip`, and the difference is the whole point. `skip` means
 * "this does not apply to me" and is only offered where the flow says a step is
 * optional. This means "it is coming" — it is accepted on *mandatory* documents,
 * and the claim records the evidence as still outstanding rather than waived.
 *
 * It exists because the alternative was a dead end. A mandatory upload with no
 * file simply re-asked, so a claimant standing at the airport — where the
 * airline's written delay confirmation routinely arrives by email hours later —
 * stalled at question eleven of sixteen with no way past it. The five questions
 * after it, bank details among them, were never asked at all. Abandoning the
 * claim was the only move the conversation left them.
 *
 * Nothing is waived by using it: `computeCompleteness` counts *uploaded*
 * document types, so a deferred document stays in `missingMandatory` and the
 * evidence checklist an adjuster reads is unchanged.
 */
export const DEFER_VALUE = 'later';

/**
 * "The file I already sent you for this question."
 *
 * A form uploads the bytes and answers the question in two separate calls, and
 * only the first of those is durable — the stored id lives in a React state
 * that a reload throws away. A claimant then sits in front of a row that says
 * *Uploaded* and a Continue button that does nothing, for ever, because the
 * step is open and nothing left on the page can name the file that would close
 * it.
 *
 * The id is not the fix. It is deliberately withheld from the public payload
 * (`publicDocument` in `claimant-conversation.service.ts`) because every
 * document read is staff-only, and handing a visitor a handle to an endpoint
 * they cannot call is how a later change turns it into a public route.
 *
 * So the claimant names the *step*, and the server finds the file — which it
 * can do without being told, and which is checked against the case either way.
 * The chat has no use for this: it sends the turn the instant the upload
 * returns, while the id is still in hand.
 */
export const ATTACHED_VALUE = '__attached';

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

/**
 * Answers that only make sense relative to another answer.
 *
 * Held in code, keyed by step id, rather than declared on the steps themselves
 * — deliberately. Flow definitions are *stored*, and a Case walks the version
 * it pinned, so a new field on `FlowStep` reaches nothing already published
 * until every row is backfilled. That is exactly how `isReview` came to be
 * missing from all five platform flows. These rules apply to every pinned
 * version the moment they ship, including ones written years earlier.
 *
 * Keying by step id is safe because the ids involved are `system: true`: the
 * publish gate already refuses a flow that drops or renames them.
 */
interface DateOrderRule {
  /** Step whose date must not fall after `later`. */
  earlier: string;
  later: string;
  /**
   * How closely to compare.
   *
   * `day` for a pair of calendar dates, which arrive at T00:00Z — comparing
   * those as instants is fine, but comparing a *datetime* against one is not,
   * so anything mixing the two must be day-granular.
   *
   * `instant` where both sides carry a real clock time and the gap between
   * them is the claim: a flight scheduled at 15:00 that left at 09:00 the same
   * day is a contradiction that day-granularity cannot see.
   */
  granularity: 'day' | 'instant';
  /** Shown when `earlier` is being answered and lands after `later`. */
  whenEarlyIsLate: string;
  /** Shown when `later` is being answered and lands before `earlier`. */
  whenLateIsEarly: string;
}

const DATE_ORDER: readonly DateOrderRule[] = [
  {
    earlier: 'trip-start',
    later: 'trip-end',
    granularity: 'day',
    whenEarlyIsLate: 'That is after the end of your trip ({other}). Please check the start date.',
    whenLateIsEarly: 'That is before your trip started ({other}). Please check the end date.',
  },
  {
    // "If it was cancelled, give the departure time of the replacement flight"
    // — a replacement always departs later, so an actual before the scheduled
    // time is not a delay at all. Left unchecked it reaches an adjuster as a
    // delay claim whose own dates show the flight leaving early.
    earlier: 'scheduled-departure',
    later: 'actual-departure',
    granularity: 'instant',
    whenEarlyIsLate:
      'That is after the flight actually departed ({other}). Please check the scheduled time.',
    whenLateIsEarly:
      'That is before the scheduled departure ({other}), which would mean the flight left early. ' +
      'Please check the time — and if the flight was cancelled, give the replacement flight’s departure.',
  },
];

/**
 * Where the incident must sit relative to the trip, per claim type.
 *
 * Not one universal rule: on a cancellation the incident is the *reason the
 * trip did not happen*, so it necessarily precedes the departure date. A blanket
 * "the incident happened during the trip" would reject every cancellation claim.
 */
const INCIDENT_WINDOW: Record<string, 'before-trip' | 'during-trip'> = {
  TRIP_CANCELLATION: 'before-trip',
  FLIGHT_DELAY: 'during-trip',
  LUGGAGE_DAMAGE: 'during-trip',
  LUGGAGE_LOSS: 'during-trip',
  MEDICAL: 'during-trip',
};

/**
 * Midnight-anchored, so a same-day comparison never fails on the clock.
 *
 * `trip-end` is a date and arrives as T00:00Z; an incident at 15:00 on the last
 * day of the trip is inside it, and comparing instants would have called that
 * "after your trip ended" — rejecting a true answer, which is worse than the
 * gap this closes.
 */
const startOfDay = (value: Date): number =>
  Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());

const asDate = (value: AnswerValue | undefined): Date | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (text === '' || text.toLowerCase() === SKIP_VALUE) return null;
  const date = parseStoredDate(text);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** "14 August 2026" — for quoting the other answer back in an error. */
const dayLabel = (value: Date): string =>
  `${value.getUTCDate()} ${
    [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ][value.getUTCMonth()]
  } ${value.getUTCFullYear()}`;

/**
 * Check one answer against the others already given.
 *
 * Separate from the per-field rules in `validateAnswer` because it needs the
 * whole answer bag, and because it stays correct in both directions: editing
 * `trip-start` to after `trip-end` is caught just as editing `trip-end` to
 * before `trip-start` is. Silent on anything it cannot compare — a missing,
 * skipped or unparseable counterpart means there is nothing to contradict.
 */
export const validateAgainstAnswers = (
  step: FlowStep,
  value: AnswerValue,
  answers: CaseAnswers,
  travelClaimType?: TravelClaimTypeLike
): AnswerValidation => {
  const subject = asDate(value);
  if (!subject) return { valid: true };
  const subjectDay = startOfDay(subject);

  for (const rule of DATE_ORDER) {
    const at = (date: Date): number =>
      rule.granularity === 'day' ? startOfDay(date) : date.getTime();
    const self = at(subject);

    if (step.id === rule.earlier) {
      const other = asDate(answers[rule.later]);
      if (other && self > at(other)) {
        return { valid: false, error: rule.whenEarlyIsLate.replace('{other}', dayLabel(other)) };
      }
    }
    if (step.id === rule.later) {
      const other = asDate(answers[rule.earlier]);
      if (other && self < at(other)) {
        return { valid: false, error: rule.whenLateIsEarly.replace('{other}', dayLabel(other)) };
      }
    }
  }

  if (step.id === 'incident-date' && travelClaimType) {
    const window = INCIDENT_WINDOW[String(travelClaimType)];
    const tripStart = asDate(answers['trip-start']);
    const tripEnd = asDate(answers['trip-end']);

    if (window === 'during-trip') {
      if (tripStart && subjectDay < startOfDay(tripStart)) {
        return {
          valid: false,
          error:
            `That is before your trip began (${dayLabel(tripStart)}). Please check the date — ` +
            'if it happened before you travelled, this may be a cancellation claim instead.',
        };
      }
      if (tripEnd && subjectDay > startOfDay(tripEnd)) {
        return {
          valid: false,
          error: `That is after your trip ended (${dayLabel(tripEnd)}). Please check the date.`,
        };
      }
    }

    if (window === 'before-trip' && tripStart && subjectDay > startOfDay(tripStart)) {
      return {
        valid: false,
        error:
          `That is after your trip was due to begin (${dayLabel(tripStart)}). For a cancellation, ` +
          'give the date of whatever stopped you travelling.',
      };
    }
  }

  return { valid: true };
};

/** Everything that can be judged from the answer alone. */
const validateField = (step: FlowStep, value: AnswerValue): AnswerValidation => {
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
              step.validation.substanceError ??
              'We need your own description here — it is the part nobody else can fill in ' +
                'for you. Even a rough one helps, for example what is damaged and how.',
          };
        }
        if (text.length < step.validation.minLength) {
          return {
            valid: false,
            error:
              step.validation.substanceError ??
              `Please give a little more detail — around ${step.validation.minLength} characters or more.`,
          };
        }
      }
      if (step.validation?.pattern && !new RegExp(step.validation.pattern).test(value.trim())) {
        return {
          valid: false,
          error:
            step.validation.patternError ??
            'That does not look right — please check the format and try again.',
        };
      }
      return { valid: true };
    }
    case 'number': {
      const num = typeof value === 'number' ? value : parseAmount(String(value));
      if (Number.isNaN(num)) {
        return {
          valid: false,
          // Names the two forms people actually type, because "please enter a
          // number" to someone who just typed "RM1,200" is not a hint.
          error: 'Please enter an amount in numbers, for example 1200 or 1200.50.',
        };
      }
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

      // A loss that has not happened yet is a typo, and a silent one: a
      // mistyped year gives `computeDeadlineFlags` a negative age, so both the
      // late-notification and out-of-window flags come back false and the CSP
      // clock the flags exist to raise is never raised. Refusing costs the
      // claimant one correction; accepting costs the firm a deadline.
      //
      // A day's grace, because a claimant in a later timezone can honestly
      // report an incident that is still "tomorrow" to the server.
      if (step.notFuture) {
        const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
        if (date.getTime() > tomorrow) {
          return {
            valid: false,
            error: 'That date is in the future. Please give the date the incident actually happened.',
          };
        }
        // And not absurdly far back. `1026` for `2026` is one slipped digit,
        // and it passed: the flags then read the incident as a thousand years
        // old and the claim arrives pre-marked out of window, rejected for a
        // typo. Ten years is well beyond any travel policy's reporting window
        // while still accepting anything a real claimant could mean.
        const tenYearsAgo = Date.now() - 10 * 365 * 24 * 60 * 60 * 1000;
        if (date.getTime() < tenYearsAgo) {
          return {
            valid: false,
            error: 'That date looks too far in the past — please check the year.',
          };
        }
      }
      return { valid: true };
    }
    case 'choice': {
      if (step.choices?.some(choice => choice.value === value)) return { valid: true };

      // Not on the list. On an `allowOther` step that is an answer, not an
      // error — the list was the common cases, and this claimant is not one.
      // Held to the same floor as a text step so "?" is still refused.
      if (step.allowOther) {
        if (typeof value !== 'string' || value.trim().length < 2) {
          return {
            valid: false,
            error: 'Please tap one of the options, or type your answer in full.',
          };
        }
        return { valid: true };
      }
      return { valid: false, error: 'Please choose one of the options.' };
    }
    case 'document': {
      // Value is the uploaded CaseDocument id, "skip" for an optional document
      // that does not apply, or "later" for one that is coming.
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

/**
 * Validate one answer: first on its own, then against the answers around it.
 *
 * Order matters. A mistyped "06/07/2026" must be met with the format hint, not
 * with "that is after the end of your trip" — the relative rules would happily
 * compare a date the claimant never meant, and send them looking for a mistake
 * in the wrong answer.
 */
export const validateAnswer = (
  step: FlowStep,
  value: AnswerValue,
  /**
   * The answers already captured, so a value can be checked against them.
   * Optional: callers without a full bag (the FNOL parser, unit tests) still
   * get every per-field rule, just not the relative ones.
   */
  context?: { answers: CaseAnswers; travelClaimType?: TravelClaimTypeLike }
): AnswerValidation => {
  const field = validateField(step, value);
  if (!field.valid || !context) return field;
  return validateAgainstAnswers(step, value, context.answers, context.travelClaimType);
};

/**
 * The wall-clock reading a claimant gave, marked as the instant we store it as.
 *
 * Intake records the time as the claimant experienced it and reads it back with
 * UTC getters, which is why nothing here applies an offset. The trouble is that
 * only *some* inputs say so. `parseTextDate` returns `toISOString()` and carries
 * a `Z`; the PWA's `<input type="datetime-local">` returns `2026-08-18T10:00`
 * and carries nothing — and ECMA-262 reads a date-*time* without a designator as
 * **local** while reading a date-only form as UTC. So the same 10:00 became two
 * different instants depending on which surface the claimant used.
 *
 * That is not a display blemish. `computeDeadlineFlags` measures the CSP
 * notification clock from this value, and on a UTC+8 server a naive reading
 * lands eight hours early — enough to mark a claimant who notified *inside* the
 * 24-hour window as late, with nothing on screen to show why.
 *
 * A `Z` is appended, never converted: the point is to keep 10:00 meaning 10:00.
 * Anything already carrying a designator, and anything not in this shape, is
 * returned untouched.
 */
export const asStoredInstant = (value: string): string => {
  const text = value.trim();
  // A date-time with no trailing `Z` and no ±HH:MM offset.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(text)) {
    return `${text}Z`;
  }
  return value;
};

/**
 * Read a stored answer as the instant it was meant to be.
 *
 * Applied on the way *out* as well as the way in, because rows written before
 * `asStoredInstant` existed still hold naive values, and a migration that
 * rewrote them would be editing the recorded answers on live claims to fix a
 * reader. Tolerating both shapes costs one call and leaves the evidence alone.
 */
export const parseStoredDate = (value: string): Date => new Date(asStoredInstant(value));

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
  const incident =
    typeof incidentDate === 'string' ? parseStoredDate(incidentDate) : new Date(incidentDate);
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
