import type { AnswerValue, FlowStep } from '@tci/shared-types';

/**
 * Last-resort interpretation of an answer the deterministic parser rejected.
 *
 * A port, for two reasons. The concrete implementation calls risk-engine,
 * because every offshore model call must write a `TransferRecord` and that
 * table belongs to the assessment context. And a port keeps this switchable:
 * the in-country model path (MASTER_PLAN §3.4) becomes a different binding
 * rather than a rewrite.
 *
 * The contract is deliberately small. It is handed one message and one step,
 * and returns a value or null. It does not decide what to ask next, does not
 * see the flow, and its output is re-validated by the same `validateAnswer`
 * that a typed answer goes through. The state machine stays the control plane.
 */
export interface AnswerNormaliser {
  /**
   * Whether normalisation is switched on. False leaves the conversation
   * entirely deterministic, which is the default — an offshore model on the
   * hot path of every intake would invert the per-claim COGS ceiling in
   * MASTER_PLAN §2.5, so it must be a triggered fallback and never the norm.
   */
  isEnabled(): boolean;

  /**
   * Interpret `text` as an answer to `step`.
   *
   * Returns null when it cannot tell — the caller then asks the question
   * again, which is exactly the behaviour that existed before this port.
   * Never throws for an unreadable message: that is an ordinary conversational
   * turn, not a fault.
   */
  normalise(
    text: string,
    step: FlowStep,
    context: { claimId?: string | null; claimantId?: string | null; tenantId?: string | null }
  ): Promise<AnswerValue | null>;
}

export const ANSWER_NORMALISER = Symbol('ANSWER_NORMALISER');
