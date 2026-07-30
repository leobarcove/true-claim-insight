import { AdjusterReportStatus, AdjusterReportType } from '@prisma/client';

/**
 * Who may author and sign an adjuster's report, and what state changes are legal.
 *
 * Pure decisions, no database, so the rules that decide whether a report may be
 * issued can be tested exhaustively in CI — these are the PD 12.7 controls an
 * examiner would ask to see demonstrated.
 */

/** Report lifecycle. Terminal states have no onward transition. */
export const REPORT_STATUS_TRANSITIONS: Record<AdjusterReportStatus, AdjusterReportStatus[]> = {
  [AdjusterReportStatus.DRAFT]: [AdjusterReportStatus.IN_REVIEW, AdjusterReportStatus.WITHDRAWN],
  // A reviewer can send it back for correction.
  [AdjusterReportStatus.IN_REVIEW]: [
    AdjusterReportStatus.SIGNED,
    AdjusterReportStatus.DRAFT,
    AdjusterReportStatus.WITHDRAWN,
  ],
  [AdjusterReportStatus.SIGNED]: [AdjusterReportStatus.ISSUED, AdjusterReportStatus.WITHDRAWN],
  // Issued is immutable: a correction is a new report that supersedes this one,
  // never an edit. What the insurer was told, and when, has to stay recoverable.
  [AdjusterReportStatus.ISSUED]: [],
  [AdjusterReportStatus.WITHDRAWN]: [],
};

export function canTransition(
  from: AdjusterReportStatus,
  to: AdjusterReportStatus
): boolean {
  return (REPORT_STATUS_TRANSITIONS[from] ?? []).includes(to);
}

/** What we know about the adjusting employee signing or authoring. */
export interface AdjusterStanding {
  id: string;
  /** Adjuster.status — only an ACTIVE adjuster may author or sign. */
  status: string;
  /**
   * Years of experience in the subject matter. PD 12.3 treats under five years
   * as junior, requiring supervision and a senior countersign. Undefined means
   * the data does not exist yet (the competency model is Phase 3).
   */
  yearsInSubject?: number;
}

export interface CountersignDecision {
  /** Must a second, senior adjuster sign this report? */
  required: boolean;
  /** Does the current attempt satisfy the requirement? */
  satisfied: boolean;
  /** Blocking in licensed mode; advisory otherwise. */
  blocking: boolean;
  /** Why this was decided — persisted on the report so it is never assumed. */
  basis: string;
}

/**
 * Decide whether a report needs a senior countersign, and whether it has one.
 *
 * The honest complication: PD 12.3/12.7(b) keys the requirement to the author's
 * seniority, and the seniority model does not exist yet — `AdjusterCompetency`
 * is Phase 3. Rather than assume every author is senior (which would silently
 * pass a junior's unsigned report) or assume none are (which would block a
 * one-adjuster firm entirely), this returns the requirement *and* the basis it
 * was decided on, and lets `licensedMode` decide whether it blocks.
 *
 * The result is that the machinery ships now and runs inert while the firm
 * operates as a TPA, becoming a hard gate on BNM registration — a flag flip,
 * not a rebuild (docs/MASTER_PLAN.md §1).
 */
export function countersignDecision(params: {
  type: AdjusterReportType;
  author: AdjusterStanding;
  signer: AdjusterStanding;
  licensedMode: boolean;
}): CountersignDecision {
  const { type, author, signer, licensedMode } = params;
  const differentPerson = author.id !== signer.id;

  // Seniority unknown: treat the author as junior, which is the safe default —
  // wrongly requiring a countersign costs a signature, wrongly waiving one
  // issues an unsupervised junior's report over the firm's name.
  if (author.yearsInSubject === undefined) {
    return {
      required: true,
      satisfied: differentPerson,
      blocking: licensedMode,
      basis: differentPerson
        ? 'Author seniority unknown (competency model not yet in place); countersigned by a second adjuster'
        : 'Author seniority unknown (competency model not yet in place); no second signature obtained',
    };
  }

  const junior = author.yearsInSubject < 5;
  if (!junior) {
    return {
      required: false,
      satisfied: true,
      blocking: false,
      basis: `Author has ${author.yearsInSubject} years in subject; senior, self-signature permitted (PD 12.3)`,
    };
  }

  const signerSenior = (signer.yearsInSubject ?? 0) >= 5;
  return {
    required: true,
    satisfied: differentPerson && signerSenior,
    blocking: licensedMode,
    basis: `Author has ${author.yearsInSubject} years in subject; junior under PD 12.3, senior countersign required for ${type} report`,
  };
}

export interface SignEligibility {
  allowed: boolean;
  reason?: string;
}

/**
 * May this adjuster sign this report?
 *
 * PD 12.7 restricts reports to adjusting employees, which the schema already
 * enforces by pointing author and signer at Adjuster rather than User. What is
 * checked here is standing: a suspended adjuster's signature carries nothing.
 */
export function canSign(params: {
  type: AdjusterReportType;
  author: AdjusterStanding;
  signer: AdjusterStanding;
  licensedMode: boolean;
  missingSections: string[];
}): SignEligibility {
  const { signer, missingSections } = params;

  if (signer.status !== 'ACTIVE') {
    return {
      allowed: false,
      reason: `Adjuster is ${signer.status}; only an ACTIVE adjusting employee may sign a report (PD 12.7)`,
    };
  }

  if (missingSections.length > 0) {
    return {
      allowed: false,
      reason:
        `Report cannot be signed while required sections are empty: ${missingSections.join(', ')}. ` +
        'PD 12.6 requires the facts, assumptions, methods and sources to be disclosed.',
    };
  }

  const countersign = countersignDecision(params);
  if (countersign.required && !countersign.satisfied && countersign.blocking) {
    return {
      allowed: false,
      reason: `${countersign.basis}. A senior countersign is required before this report may be signed (PD 12.7(b)).`,
    };
  }

  return { allowed: true };
}
