import { ClaimStatus, SlaStage } from '@prisma/client';

/**
 * Which SLA clocks a claim status transition should act on.
 *
 * Kept as data, next to the stages themselves, so the mapping between the claim
 * lifecycle and the firm's turnaround obligations is reviewable in one place
 * rather than scattered through service methods. A regulator's question — "what
 * starts the ten-day final-report clock?" — has a single answer here.
 */
export interface SlaTransition {
  start?: SlaStage[];
  /** Paused with the given reason: the firm is waiting on someone else. */
  pause?: { stage: SlaStage; reason: string }[];
  resume?: SlaStage[];
  stop?: SlaStage[];
}

/**
 * Note on coverage: `ACK_TO_INSURER` is absent on purpose. It is started and
 * stopped by the `Assignment` lifecycle, because the acknowledgement falls due
 * before a claim exists — mapping it onto a claim status would measure it from
 * the wrong moment.
 *
 * `REPORT_PENDING` stands in for "documents complete" for the same reason: the
 * evidence checklist computes completeness but emits no event yet. When
 * `documentsCompleteAt` lands, FINAL_REPORT moves onto it, which is where CSP
 * actually starts the fourteen working days (para 10.13, non-motor).
 */
export const SLA_TRANSITIONS: Partial<Record<ClaimStatus, SlaTransition>> = {
  // An adjuster now owns the claim: the preliminary-report target begins.
  [ClaimStatus.ASSIGNED]: {
    start: [SlaStage.PRELIMINARY_REPORT],
  },

  // Waiting on the claimant. Both report clocks pause: this is not time the firm
  // was given to work, and CSP's window runs from *complete* documents.
  [ClaimStatus.DOCUMENTS_PENDING]: {
    pause: [
      { stage: SlaStage.PRELIMINARY_REPORT, reason: 'Awaiting documents from claimant' },
      { stage: SlaStage.FINAL_REPORT, reason: 'Awaiting documents from claimant' },
    ],
  },

  // Assessment underway again — whatever was paused resumes.
  [ClaimStatus.IN_ASSESSMENT]: {
    resume: [SlaStage.PRELIMINARY_REPORT, SlaStage.FINAL_REPORT],
  },

  // Documents are in and the report is being written: the final-report clock
  // starts and the preliminary obligation is discharged.
  [ClaimStatus.REPORT_PENDING]: {
    start: [SlaStage.FINAL_REPORT],
    stop: [SlaStage.PRELIMINARY_REPORT],
  },

  // The report has gone to the insurer; the firm's own clocks stop and the
  // insurer's decision window begins being measured.
  [ClaimStatus.UNDER_REVIEW]: {
    stop: [SlaStage.PRELIMINARY_REPORT, SlaStage.FINAL_REPORT],
    start: [SlaStage.INSURER_DECISION],
  },

  // The insurer has decided, so every firm-side clock is discharged. Both report
  // stages are stopped here and not only at UNDER_REVIEW, because UNDER_REVIEW is
  // currently unreachable in the claim state machine — relying on it would leave
  // the final-report clock running on an approved claim until the sweep marked it
  // breached, inventing a failure the firm never had.
  [ClaimStatus.APPROVED]: {
    stop: [SlaStage.PRELIMINARY_REPORT, SlaStage.FINAL_REPORT, SlaStage.INSURER_DECISION],
    start: [SlaStage.INSURER_PAYMENT],
  },

  [ClaimStatus.REJECTED]: {
    stop: [SlaStage.PRELIMINARY_REPORT, SlaStage.FINAL_REPORT, SlaStage.INSURER_DECISION],
  },

  // Fraud referral: the firm's reporting obligation is suspended while SIU works.
  [ClaimStatus.ESCALATED_SIU]: {
    pause: [
      { stage: SlaStage.PRELIMINARY_REPORT, reason: 'Referred to SIU investigation' },
      { stage: SlaStage.FINAL_REPORT, reason: 'Referred to SIU investigation' },
    ],
  },

  // Terminal: nothing may remain live on a closed claim.
  [ClaimStatus.CLOSED]: {
    stop: [
      SlaStage.PRELIMINARY_REPORT,
      SlaStage.FINAL_REPORT,
      SlaStage.INSURER_DECISION,
      SlaStage.INSURER_PAYMENT,
      SlaStage.SUPPLEMENTARY_CLAIM,
    ],
  },
};
