import {
  ClaimCategory,
  FraudCategory,
  SignalSeverity,
  Prisma,
} from '@prisma/client';

/**
 * Context passed to every provider when evaluating a claim. Loaded once by
 * the orchestrator and shared across providers so each plugin doesn't have
 * to re-query the database.
 */
export interface FraudSignalContext {
  claimId: string;
  category: ClaimCategory;
  tenantId: string | null;
  // Lazily loaded relations — providers should access via the loader to keep
  // queries minimal. The base loader is wired up by the orchestrator.
  claim: Prisma.ClaimGetPayload<{
    include: {
      claimant: true;
      adjuster: true;
      documents: true;
      floodClaim: true;
    };
  }>;
}

/**
 * What a provider emits per signal. The orchestrator persists these as
 * FraudSignal rows. Multiple signals per provider per claim are allowed —
 * e.g. one signal for "rainfall threshold met" and another for "lightning
 * strike confirmed within 500m".
 */
export interface FraudSignalEmission {
  category: FraudCategory;
  signalType: string;
  severity: SignalSeverity;
  confidence: number; // 0..1
  message?: string;
  rawData?: Record<string, unknown>;
}

/**
 * Contract every fraud-signal detector implements. Designed after Shift
 * Technology's signal-producer pattern — providers are independent, each
 * produces a small, typed signal, and the risk engine fuses them.
 */
export interface FraudSignalProvider {
  /**
   * Stable identifier persisted on every signal row. Must be unique across
   * registered providers. Examples: "MetMalaysiaRainfall", "HumeBehavioural",
   * "RepeatClaimantGraph", "ParametricLightning".
   */
  readonly name: string;

  /**
   * Claim categories this provider applies to. The orchestrator skips
   * providers whose `appliesTo` doesn't include the current claim's category.
   * A parametric weather provider would return `['FLOOD', 'LIGHTNING']`.
   */
  readonly appliesTo: ReadonlyArray<ClaimCategory>;

  /**
   * Fraud signal categories this provider may emit. Used for UI grouping and
   * for the orchestrator to advertise what kinds of signals are possible
   * before evaluation.
   */
  readonly emits: ReadonlyArray<FraudCategory>;

  /**
   * Evaluate the claim and return zero or more signals. Implementations
   * should be idempotent — the orchestrator may re-run them.
   *
   * Throwing is fine; the orchestrator catches and logs, then continues to
   * the next provider. One failing provider must never block the others.
   */
  evaluate(ctx: FraudSignalContext): Promise<FraudSignalEmission[]>;
}

export const FRAUD_SIGNAL_PROVIDER = Symbol('FRAUD_SIGNAL_PROVIDER');
