/**
 * Notification templates, as a code registry rather than a table.
 *
 * The same reasoning as the PD 12.6 report sections: a control editable by an
 * UPDATE statement is not a control. What the firm told a claimant, and when,
 * is evidence — and evidence whose wording can be changed after the fact, with
 * no migration and no review, is worth less than evidence that cannot.
 *
 * ## The no-sensitive-data rule
 *
 * Each template declares its own input type, and those types admit only
 * non-identifying fields. There is no `data: Record<string, unknown>` escape
 * hatch, so an NRIC, a bank account or a fraud signal cannot reach an email by
 * a caller passing the wrong bag of values — it would not compile. Email is
 * unencrypted in transit beyond the first hop and lands in mailboxes this
 * platform does not control, which is exactly the wrong place for the data
 * §8's encryption work spent its effort protecting.
 *
 * A case reference, a claim number and a deadline are safe: they identify a
 * record to someone who already has access to it, and mean nothing to anyone
 * else.
 */

export type TemplateId =
  | 'case.information-requested'
  | 'claim.assessment-scheduled'
  | 'sla.breach-escalated'
  | 'assignment.acknowledged';

export interface RenderedMessage {
  subject: string;
  text: string;
}

/** A claimant has been asked for something before their case can proceed. */
export interface InformationRequestedInput {
  caseNumber: string;
  /** The operator's note. Written by staff for the claimant to read. */
  request: string;
  claimantName?: string;
}

/** A firm-owned deadline has passed. Goes to the firm, never to a claimant. */
export interface SlaBreachInput {
  stage: string;
  subject: string;
  workingDaysLate: number;
  escalationLevel: number;
}

/** The firm has acknowledged an insurer's appointment — the CSP 1-day act. */
export interface AssignmentAcknowledgedInput {
  externalRef: string;
  firmName: string;
  acknowledgedAt: Date;
  scope?: string;
}

const asDate = (value: Date): string =>
  value.toISOString().slice(0, 10).split('-').reverse().join('/');

/**
 * The wall-clock time in Kuala Lumpur.
 *
 * Stored naive-UTC, and an appointment is the one field where getting the zone
 * wrong is unforgivable: telling someone 09:00 when the adjuster arrives at
 * 17:00 is worse than telling them nothing.
 */
const asTime = (value: Date): string => {
  const kl = new Date(value.getTime() + 8 * 3600_000);
  return `${String(kl.getUTCHours()).padStart(2, '0')}:${String(kl.getUTCMinutes()).padStart(2, '0')}`;
};

export interface AssessmentScheduledInput {
  claimNumber: string;
  claimantName?: string;
  /** When the assessment happens, already in Malaysian time for display. */
  when: Date;
  /** How it is being carried out — the words the claimant needs, not the enum. */
  mode: 'SITE_VISIT' | 'VIDEO';
  /** Where, for a site visit. Absent for a video call. */
  address?: string;
  adjusterName?: string;
}

export const TEMPLATES = {
  'case.information-requested': (input: InformationRequestedInput): RenderedMessage => ({
    subject: `Action needed on your claim ${input.caseNumber}`,
    text: [
      input.claimantName ? `Dear ${input.claimantName},` : 'Hello,',
      '',
      `We have reviewed your claim ${input.caseNumber} and need one more thing`,
      'from you before it can move forward:',
      '',
      `    ${input.request}`,
      '',
      'You can add it by reopening your claim in the app. Nothing else is needed',
      'from you in the meantime.',
      '',
      'True Claim Insight',
      '',
      '--',
      'This message is about a claim you submitted. Please do not reply with',
      'bank details or identity documents by email — add them to your claim in',
      'the app, where they are encrypted.',
    ].join('\n'),
  }),

  /**
   * Telling the claimant when someone is coming.
   *
   * The router has sent property losses to a site visit since 6 Aug and the
   * appointment was held only in the firm's own diary — the claimant found out
   * when an adjuster arrived at their door, which is not a way to attend
   * someone's fire-damaged home. What the message must carry is the date, the
   * time, and what will happen; everything else is noise to someone who has
   * just had a loss.
   */
  'claim.assessment-scheduled': (input: AssessmentScheduledInput): RenderedMessage => ({
    subject:
      input.mode === 'SITE_VISIT'
        ? `Visit arranged for your claim ${input.claimNumber}`
        : `Video assessment arranged for your claim ${input.claimNumber}`,
    text: [
      input.claimantName ? `Dear ${input.claimantName},` : 'Hello,',
      '',
      input.mode === 'SITE_VISIT'
        ? 'We have arranged to visit and inspect the damage.'
        : 'We have arranged a video call to go through your claim.',
      '',
      `  Claim:   ${input.claimNumber}`,
      `  Date:    ${asDate(input.when)}`,
      `  Time:    ${asTime(input.when)}`,
      input.mode === 'SITE_VISIT' && input.address ? `  Where:   ${input.address}` : '',
      input.adjusterName ? `  Adjuster: ${input.adjusterName}` : '',
      '',
      input.mode === 'SITE_VISIT'
        ? 'Please make sure someone over 18 is there to let us in. Leave the damage'
        : 'You will receive a link to join shortly before the call. Please have your',
      input.mode === 'SITE_VISIT'
        ? 'as it is if you safely can — it helps us assess it accurately.'
        : 'documents to hand.',
      '',
      'If this time does not suit, reply to this email or call us and we will',
      'rearrange.',
      '',
      'True Claim Insight',
      '',
      '--',
      'This message is about a claim you submitted. Please do not reply with',
      'bank details or identity documents by email — add them to your claim in',
      'the app, where they are encrypted.',
    ]
      .filter(line => line !== '')
      .join('\n'),
  }),

  'sla.breach-escalated': (input: SlaBreachInput): RenderedMessage => ({
    subject: `SLA breach (level ${input.escalationLevel}) — ${input.stage} on ${input.subject}`,
    text: [
      `A firm-owned turnaround deadline has passed.`,
      '',
      `  Stage:        ${input.stage}`,
      `  Matter:       ${input.subject}`,
      `  Days late:    ${input.workingDaysLate} working day(s)`,
      `  Escalation:   level ${input.escalationLevel}`,
      '',
      input.escalationLevel >= 3
        ? 'Level 3 raises a compliance event for the Board report under PD 11.2(d).'
        : 'This escalates further if it remains open.',
      '',
      'True Claim Insight — automated SLA sweep',
    ].join('\n'),
  }),

  'assignment.acknowledged': (input: AssignmentAcknowledgedInput): RenderedMessage => ({
    subject: `Appointment acknowledged — ${input.externalRef}`,
    text: [
      'Thank you for the appointment.',
      '',
      `  Your reference:   ${input.externalRef}`,
      `  Acknowledged:     ${asDate(input.acknowledgedAt)}`,
      input.scope ? `  Scope:            ${input.scope}` : '',
      '',
      `${input.firmName} has received your instruction and has opened the matter.`,
      'We will report in line with the agreed turnaround.',
      '',
      'True Claim Insight',
    ]
      .filter(line => line !== '')
      .join('\n'),
  }),
} as const;

/** Render a template by id, with its own input type enforced at the call site. */
export function render(
  id: 'case.information-requested',
  input: InformationRequestedInput
): RenderedMessage;
export function render(id: 'sla.breach-escalated', input: SlaBreachInput): RenderedMessage;
export function render(
  id: 'assignment.acknowledged',
  input: AssignmentAcknowledgedInput
): RenderedMessage;
export function render(
  id: 'claim.assessment-scheduled',
  input: AssessmentScheduledInput
): RenderedMessage;
export function render(
  id: TemplateId,
  input:
    | InformationRequestedInput
    | SlaBreachInput
    | AssignmentAcknowledgedInput
    | AssessmentScheduledInput
): RenderedMessage {
  return (TEMPLATES[id] as (value: unknown) => RenderedMessage)(input);
}
