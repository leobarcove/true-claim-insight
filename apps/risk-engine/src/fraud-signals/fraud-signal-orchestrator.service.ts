import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { FraudSignal, Prisma } from '@prisma/client';
import { loadFraudClaim } from './fraud-claim.query';
import {
  FraudSignalContext,
  FraudSignalEmission,
  FraudSignalProvider,
} from './types';
import { MockBaselineProvider } from './providers/mock-baseline.provider';
import { MetMalaysiaRainfallProvider } from './providers/met-malaysia-rainfall.provider';

/**
 * Orchestrates fraud-signal evaluation across all registered providers.
 *
 * Design notes:
 *  - Providers are independent. One failing provider never blocks others —
 *    errors are caught, logged, and execution continues.
 *  - The orchestrator filters by `appliesTo` so each provider only runs for
 *    relevant claim categories.
 *  - Signals are persisted as separate rows (Shift Technology pattern). The
 *    UI surfaces individual signals; a separate fusion step (not in this
 *    skeleton) combines them into an overall risk score.
 *  - Adding a provider = adding a class to the constructor list. No central
 *    registry to manage. Trade-off: explicit, easy to reason about, breaks
 *    pure plug-in dynamism. Worth it for type safety in NestJS.
 */
@Injectable()
export class FraudSignalOrchestrator {
  private readonly logger = new Logger(FraudSignalOrchestrator.name);
  private readonly providers: FraudSignalProvider[];

  constructor(
    private readonly prisma: PrismaService,
    mockBaseline: MockBaselineProvider,
    metMalaysiaRainfall: MetMalaysiaRainfallProvider
    // Future providers — inject and append:
    //   jpsGauges: JpsGaugeProvider,
    //   sentinelSatellite: SentinelFloodImageryProvider,
    //   repeatClaimant: RepeatClaimantGraphProvider,
    //   documentForgery: DocumentForgeryProvider,
  ) {
    this.providers = [mockBaseline, metMalaysiaRainfall];
  }

  /**
   * Evaluate all applicable providers for the claim and persist their
   * signals. Returns the persisted rows.
   */
  async evaluateClaim(claimId: string): Promise<FraudSignal[]> {
    const claim = await loadFraudClaim(this.prisma, claimId);
    if (!claim) {
      this.logger.warn(`evaluateClaim: claim ${claimId} not found`);
      return [];
    }

    const ctx: FraudSignalContext = {
      claimId: claim.id,
      category: claim.category,
      tenantId: claim.tenantId ?? null,
      claim,
    };

    const applicable = this.providers.filter(p =>
      p.appliesTo.includes(claim.category)
    );
    this.logger.log(
      `Evaluating ${applicable.length}/${this.providers.length} providers ` +
        `for claim ${claimId} (category=${claim.category})`
    );

    const persisted: FraudSignal[] = [];

    // Run providers in parallel — each is independent and the orchestrator
    // isolates failures so one slow/broken provider doesn't block others.
    const results = await Promise.allSettled(
      applicable.map(p => this.runProvider(p, ctx))
    );

    for (let i = 0; i < results.length; i++) {
      const provider = applicable[i];
      const result = results[i];

      if (result.status === 'rejected') {
        this.logger.error(
          `Provider ${provider.name} failed: ${result.reason?.message ?? result.reason}`
        );
        continue;
      }

      for (const emission of result.value) {
        const row = await this.persist(claimId, provider.name, emission);
        persisted.push(row);
      }
    }

    this.logger.log(
      `Persisted ${persisted.length} signal(s) for claim ${claimId}`
    );
    return persisted;
  }

  /**
   * Get all signals for a claim, newest first. UI calls this to render the
   * fraud-signals panel on the adjuster claim detail page.
   */
  async listForClaim(claimId: string): Promise<FraudSignal[]> {
    return this.prisma.fraudSignal.findMany({
      where: { claimId },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
    });
  }

  private async runProvider(
    provider: FraudSignalProvider,
    ctx: FraudSignalContext
  ): Promise<FraudSignalEmission[]> {
    return provider.evaluate(ctx);
  }

  private persist(
    claimId: string,
    providerName: string,
    e: FraudSignalEmission
  ) {
    return this.prisma.fraudSignal.create({
      data: {
        claimId,
        provider: providerName,
        category: e.category,
        signalType: e.signalType,
        severity: e.severity,
        confidence: e.confidence,
        message: e.message,
        rawData: (e.rawData ?? {}) as Prisma.InputJsonValue,
      },
    });
  }
}
