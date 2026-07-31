/**
 * Competency, supervision and assignment eligibility — PD 12.1–12.4, as pure
 * decisions.
 *
 * Three distinct controls, kept distinct because the PD keys them differently:
 *  - 12.3: a *new* adjusting employee is closely supervised for at least one
 *    year — keyed to when they joined, not their prior experience.
 *  - 12.4: *senior* is a recognition the firm grants, with five years in the
 *    subject as the floor and volume/performance as considerations.
 *  - 12.2(b): work is assigned commensurate with skills, qualifications and
 *    experience — keyed to competency in the claim's category.
 */

export const SENIOR_YEARS_FLOOR = 5;
export const SUPERVISION_YEARS = 1;

export interface CompetencyRecord {
  yearsInSubject: number;
  casesHandled: number;
  performanceSatisfactory: boolean;
  seniorRecognisedAt: Date | null;
}

/** Is this adjuster still within the PD 12.3 close-supervision year? */
export function underSupervision(adjustingSince: Date | null | undefined, now: Date): boolean {
  // Unknown start date reads as under supervision: the safe default, exactly as
  // unknown seniority reads as junior. The cost is a countersign; the
  // alternative is unsupervised work by someone whose first day nobody recorded.
  if (!adjustingSince) return true;

  const supervisionEnds = new Date(adjustingSince.getTime());
  supervisionEnds.setUTCFullYear(supervisionEnds.getUTCFullYear() + SUPERVISION_YEARS);
  return now.getTime() < supervisionEnds.getTime();
}

export interface RecognitionDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * May this competency be recognised as senior (PD 12.4)?
 *
 * The five-year floor is hard — 12.4(a) says "shall ensure". Volume and
 * performance are the 12.4(b) considerations: the rule requires them to be
 * *present* (non-trivial volume, satisfactory performance) but the weighing is
 * the recogniser's judgement, which is why recognition is an act by a named
 * person rather than a computed flag.
 */
export function canRecogniseSenior(competency: CompetencyRecord): RecognitionDecision {
  if (competency.yearsInSubject < SENIOR_YEARS_FLOOR) {
    return {
      allowed: false,
      reason:
        `PD 12.4(a) requires at least ${SENIOR_YEARS_FLOOR} years of adjusting experience in the ` +
        `subject matter; this adjuster has ${competency.yearsInSubject}.`,
    };
  }
  if (competency.casesHandled <= 0) {
    return {
      allowed: false,
      reason:
        'PD 12.4(b)(i) requires the number of relevant cases handled to be taken into account; ' +
        'none are recorded.',
    };
  }
  if (!competency.performanceSatisfactory) {
    return {
      allowed: false,
      reason:
        'PD 12.4(b)(ii) requires satisfactory performance across relevant cases; it has not ' +
        'been attested.',
    };
  }
  return { allowed: true };
}

export interface AssignmentEligibilityInput {
  adjusterStatus: string;
  licenseVerifiedAt: Date | null;
  /** Competency in the claim's category, if any. */
  competency: CompetencyRecord | null;
  /** PD 11.2(e): is the minimum background-check set on record? */
  screeningComplete?: boolean;
  licensedMode: boolean;
}

export interface AssignmentEligibility {
  allowed: boolean;
  /** Non-blocking concerns, recorded on the audit row in TPA mode. */
  advisories: string[];
  reason?: string;
}

/**
 * May this adjuster be assigned this claim (PD 12.1, 12.2(b))?
 *
 * A suspended adjuster is refused in every mode — that is not a licence
 * question. The competency and licence-verification checks are the licence
 * flip: hard gates once registered, recorded advisories while a TPA, so the
 * firm arrives at registration with the habit and the history.
 */
export function assignmentEligibility(input: AssignmentEligibilityInput): AssignmentEligibility {
  const { adjusterStatus, licenseVerifiedAt, competency, licensedMode } = input;

  if (adjusterStatus !== 'ACTIVE') {
    return {
      allowed: false,
      advisories: [],
      reason: `Adjuster is ${adjusterStatus}; only an ACTIVE adjuster may be assigned a claim.`,
    };
  }

  const advisories: string[] = [];
  if (!licenseVerifiedAt) {
    advisories.push('licence has not been verified (licenseVerifiedAt is unset)');
  }
  if (!competency) {
    advisories.push('no recorded competency in this claim category (PD 12.2(b))');
  }
  if (input.screeningComplete === false) {
    advisories.push('pre-employment screening incomplete (PD 11.2(e) minimum)');
  }

  if (licensedMode && advisories.length) {
    return {
      allowed: false,
      advisories,
      reason:
        `Assignment refused in registered mode: ${advisories.join('; ')}. ` +
        'PD 12.2(b) requires assignment commensurate with skills, qualifications and experience.',
    };
  }

  return { allowed: true, advisories };
}
