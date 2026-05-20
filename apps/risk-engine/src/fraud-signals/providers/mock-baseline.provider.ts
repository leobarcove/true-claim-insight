import { Injectable, Logger } from '@nestjs/common';
import { ClaimCategory, FraudCategory, SignalSeverity } from '@prisma/client';
import {
  FraudSignalContext,
  FraudSignalEmission,
  FraudSignalProvider,
} from '../types';

/**
 * Mock provider that always emits one INFO-level signal. Exists so the
 * orchestrator wiring is verifiable end-to-end without real integrations.
 * Replace with concrete providers (MetMalaysia, JPS, satellite, etc.) as
 * they're built — this can be deregistered or left as a sanity-check
 * heartbeat in dev environments.
 */
@Injectable()
export class MockBaselineProvider implements FraudSignalProvider {
  private readonly logger = new Logger(MockBaselineProvider.name);

  readonly name = 'MockBaseline';
  readonly appliesTo: ReadonlyArray<ClaimCategory> = [
    'MOTOR',
    'FLOOD',
    'FIRE',
    'LIGHTNING',
    'BURGLARY',
    'PERSONAL_ACCIDENT',
    'HOH',
    'OTHER',
  ] as const;
  readonly emits: ReadonlyArray<FraudCategory> = ['POLICY'] as const;

  async evaluate(ctx: FraudSignalContext): Promise<FraudSignalEmission[]> {
    this.logger.debug(
      `MockBaseline evaluating claim ${ctx.claimId} (${ctx.category})`
    );
    return [
      {
        category: 'POLICY',
        signalType: 'mock_baseline_evaluated',
        severity: SignalSeverity.INFO,
        confidence: 1.0,
        message: 'Mock baseline check completed (wiring sanity signal).',
        rawData: {
          claimCategory: ctx.category,
          evaluatedAt: new Date().toISOString(),
        },
      },
    ];
  }
}
