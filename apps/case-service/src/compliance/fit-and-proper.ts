/**
 * Fit-and-proper criteria — PD 10.1/10.2, as data and pure decisions.
 *
 * The criteria are transcribed from the paragraphs, one code each, so an
 * attestation can be checked for coverage: 10.1 applies to shareholders *and*
 * KRPs; 10.2 adds six more for KRPs only. An attestation that skips a
 * criterion is refused — silence on "not an undischarged bankrupt" is not the
 * same as attesting it.
 */

export interface Criterion {
  code: string;
  paragraph: '10.1' | '10.2';
  text: string;
}

/** PD 10.1 — shareholders and KRPs alike. */
export const CRITERIA_10_1: Criterion[] = [
  {
    code: '10.1a',
    paragraph: '10.1',
    text: 'Not convicted of any offence under the FSA, or any offence involving fraud or dishonesty under any other written law',
  },
  { code: '10.1b', paragraph: '10.1', text: 'Not an undischarged bankrupt' },
  {
    code: '10.1c',
    paragraph: '10.1',
    text: 'Not in the process of being wound up, wound up or otherwise dissolved',
  },
  {
    code: '10.1d',
    paragraph: '10.1',
    text: 'No suspended payments; has not compounded with creditors, in or outside Malaysia',
  },
];

/** PD 10.2 — KRPs additionally. */
export const CRITERIA_10_2: Criterion[] = [
  {
    code: '10.2a',
    paragraph: '10.2',
    text: 'No deceitful, oppressive or otherwise improper business practices, nor conduct discrediting professional standing',
  },
  {
    code: '10.2b',
    paragraph: '10.2',
    text: 'No contravention of requirements or directions of a regulatory or professional body, the Government or its agencies',
  },
  {
    code: '10.2c',
    paragraph: '10.2',
    text: 'Not involved in the management of a company whose licence, approval or registration was revoked or refused by BNM',
  },
  {
    code: '10.2d',
    paragraph: '10.2',
    text: 'Not the subject of disciplinary or criminal proceedings, nor notified of an impending investigation that might lead to them',
  },
  {
    code: '10.2e',
    paragraph: '10.2',
    text: 'Has not acted unfairly or dishonestly in dealings with customers, employers, auditors or a regulatory authority',
  },
  {
    code: '10.2f',
    paragraph: '10.2',
    text: 'Not dismissed or asked to resign from employment or a position of trust on grounds of dishonesty',
  },
];

/** Which criteria this person must be attested against. */
export function applicableCriteria(personType: string): Criterion[] {
  // 10.1 binds everyone in the register; 10.2 adds for anyone who is a KRP.
  return personType === 'SHAREHOLDER' ? CRITERIA_10_1 : [...CRITERIA_10_1, ...CRITERIA_10_2];
}

export interface CriterionResponse {
  outcome: 'MET' | 'NOT_MET';
  note?: string;
}

export interface AttestationValidation {
  valid: boolean;
  /** Applicable criteria with no response — silence is not attestation. */
  missing: string[];
  /** NOT_MET responses lacking the note that makes them a usable record. */
  notMetWithoutNote: string[];
  /** All NOT_MET codes — the fitness finding, Board-visible when non-empty. */
  notMet: string[];
}

export function validateAttestation(
  personType: string,
  responses: Record<string, CriterionResponse>
): AttestationValidation {
  const applicable = applicableCriteria(personType);

  const missing = applicable
    .filter(criterion => !responses[criterion.code]?.outcome)
    .map(criterion => criterion.code);

  const notMet = applicable
    .filter(criterion => responses[criterion.code]?.outcome === 'NOT_MET')
    .map(criterion => criterion.code);

  const notMetWithoutNote = notMet.filter(code => !responses[code]?.note?.trim());

  return {
    valid: missing.length === 0 && notMetWithoutNote.length === 0,
    missing,
    notMetWithoutNote,
    notMet,
  };
}

export type FitStanding = 'FIT' | 'NOT_FIT' | 'DUE' | 'NEVER_ATTESTED';

/**
 * Re-attestation period: one year. The PD requires *ongoing* compliance rather
 * than naming a cycle — annual is the firm's own policy choice, recorded here
 * as such and not attributed to the paragraph.
 */
export const REATTESTATION_MONTHS = 12;

export function fitStanding(
  latest: { attestedAt: Date; allMet: boolean } | null,
  now: Date
): FitStanding {
  if (!latest) return 'NEVER_ATTESTED';
  if (!latest.allMet) return 'NOT_FIT';

  const due = new Date(latest.attestedAt.getTime());
  due.setUTCMonth(due.getUTCMonth() + REATTESTATION_MONTHS);
  return now.getTime() >= due.getTime() ? 'DUE' : 'FIT';
}
