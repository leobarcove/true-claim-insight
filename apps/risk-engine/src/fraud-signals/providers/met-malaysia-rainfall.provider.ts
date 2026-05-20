import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClaimCategory, FraudCategory, SignalSeverity } from '@prisma/client';
import { PrismaService } from '../../config/prisma.service';
import {
  FraudSignalContext,
  FraudSignalEmission,
  FraudSignalProvider,
} from '../types';
import {
  RAINFALL_DATA_SOURCE,
  RainfallDataSource,
  RainfallReading,
} from './rainfall-data-source';

/**
 * MetMalaysia rainfall parametric provider.
 *
 * Pattern inspiration: Swiss Re's parametric flood products. The idea —
 * once external weather data verifies rainfall above a defined threshold
 * at the claim postcode on the claim date, the claim is "parametrically
 * triggered". Low-value claims can be fast-tracked; high-value claims
 * still get an adjuster, but the parametric signal is a strong supporting
 * indicator.
 *
 * Conversely, **absence** of rainfall when a flood claim is filed is one
 * of the strongest single fraud signals available. We emit CRITICAL when
 * the claim's date+postcode shows zero rainfall.
 *
 * Two side-effects on persist:
 *  1. FraudSignal row(s) created (one PARAMETRIC, possibly one
 *     ENVIRONMENTAL for named event linkage).
 *  2. FloodClaim.parametricTriggerMet flag updated based on the
 *     rainfall threshold result. The Property Details UI reads this
 *     flag directly.
 *
 * Plugs into the FraudSignalOrchestrator like any other provider — same
 * interface, same isolation guarantees.
 */
@Injectable()
export class MetMalaysiaRainfallProvider implements FraudSignalProvider {
  private readonly logger = new Logger(MetMalaysiaRainfallProvider.name);

  readonly name = 'MetMalaysiaRainfall';
  // Rainfall applies to flood directly, lightning indirectly (a separate
  // Lightning provider would query the strike network, not rainfall). For
  // now we only target FLOOD.
  readonly appliesTo: ReadonlyArray<ClaimCategory> = ['FLOOD'] as const;
  readonly emits: ReadonlyArray<FraudCategory> = [
    'PARAMETRIC',
    'ENVIRONMENTAL',
  ] as const;

  // Threshold in mm/24h above which we declare the parametric trigger
  // met. Aligns with MetMalaysia's "Amaran Hujan Lebat" (heavy rain
  // warning) bands — typical declared events involve 60mm+ in 24h.
  private readonly THRESHOLD_MM = 60;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(RAINFALL_DATA_SOURCE)
    private readonly rainfall: RainfallDataSource
  ) {}

  async evaluate(ctx: FraudSignalContext): Promise<FraudSignalEmission[]> {
    const flood = ctx.claim.floodClaim;
    if (!flood) {
      this.logger.warn(`${this.name}: claim ${ctx.claimId} has no flood_claim row`);
      return [];
    }

    const postcode = flood.postcode;
    if (!postcode) {
      // No postcode = can't query the rainfall network. Emit an INFO
      // signal so the adjuster sees we tried.
      return [
        {
          category: 'PARAMETRIC',
          signalType: 'rainfall_unverifiable',
          severity: SignalSeverity.INFO,
          confidence: 1,
          message:
            'Postcode not provided on the flood claim — parametric verification skipped.',
          rawData: { reason: 'missing_postcode' },
        },
      ];
    }

    const dateIso = (flood.incidentStart ?? ctx.claim.incidentDate)
      .toISOString()
      .slice(0, 10);
    const reading = await this.rainfall.getRainfall(postcode, dateIso);

    if (!reading) {
      return [
        {
          category: 'PARAMETRIC',
          signalType: 'rainfall_data_unavailable',
          severity: SignalSeverity.INFO,
          confidence: 0.6,
          message: `No rainfall data available for postcode ${postcode} on ${dateIso}.`,
          rawData: { postcode, date: dateIso },
        },
      ];
    }

    const emissions: FraudSignalEmission[] = [];
    const triggerMet = reading.rainfallMm >= this.THRESHOLD_MM;
    emissions.push(this.rainfallEmission(reading, triggerMet, postcode, dateIso));

    if (reading.namedEventRef) {
      emissions.push(this.namedEventEmission(reading, postcode, dateIso));
    }

    // Side-effect: stamp the FloodClaim row so the UI badge reflects the
    // outcome immediately. Also record the named event ref if any.
    try {
      await this.prisma.floodClaim.update({
        where: { id: flood.id },
        data: {
          parametricTriggerMet: triggerMet,
          metMalaysiaEventRef: reading.namedEventRef ?? flood.metMalaysiaEventRef,
        },
      });
    } catch (e: any) {
      // Non-fatal — the signal rows are still useful even if the flag
      // update fails. Orchestrator catches and continues anyway.
      this.logger.error(
        `Failed to update flood_claim.parametricTriggerMet for ${flood.id}: ${e.message}`
      );
    }

    return emissions;
  }

  /**
   * Build the PARAMETRIC rainfall signal. Severity depends on the
   * relationship between recorded rainfall and the threshold:
   *  - rainfall ≥ threshold * 2 → HIGH (overwhelming evidence supporting the claim)
   *  - rainfall ≥ threshold → MEDIUM (claim is plausible)
   *  - rainfall < 5mm at flood claim → CRITICAL (very suspicious)
   *  - otherwise → LOW (claim is weakly supported)
   */
  private rainfallEmission(
    r: RainfallReading,
    triggerMet: boolean,
    postcode: string,
    dateIso: string
  ): FraudSignalEmission {
    let severity: SignalSeverity;
    let message: string;

    if (r.rainfallMm < 5) {
      severity = SignalSeverity.CRITICAL;
      message =
        `Only ${r.rainfallMm}mm of rain recorded at ${r.stationName} on ${dateIso} — ` +
        `inconsistent with a flood claim. Escalate for SIU review.`;
    } else if (r.rainfallMm >= this.THRESHOLD_MM * 2) {
      severity = SignalSeverity.HIGH;
      message =
        `Heavy rainfall confirmed: ${r.rainfallMm}mm at ${r.stationName} on ${dateIso} ` +
        `(>${this.THRESHOLD_MM * 2}mm). Strong parametric support for the claim.`;
    } else if (triggerMet) {
      severity = SignalSeverity.MEDIUM;
      message =
        `Rainfall threshold met: ${r.rainfallMm}mm at ${r.stationName} on ${dateIso} ` +
        `(threshold ${this.THRESHOLD_MM}mm).`;
    } else {
      severity = SignalSeverity.LOW;
      message =
        `Only ${r.rainfallMm}mm at ${r.stationName} on ${dateIso} — below the ` +
        `${this.THRESHOLD_MM}mm parametric threshold. Claim requires additional evidence.`;
    }

    return {
      category: 'PARAMETRIC',
      signalType: triggerMet
        ? 'rainfall_threshold_met'
        : r.rainfallMm < 5
          ? 'rainfall_inconsistent_with_claim'
          : 'rainfall_below_threshold',
      severity,
      confidence: r.confidence,
      message,
      rawData: {
        postcode,
        date: dateIso,
        stationName: r.stationName,
        rainfallMm: r.rainfallMm,
        thresholdMm: this.THRESHOLD_MM,
        warningIssued: r.warningIssued ?? false,
      },
    };
  }

  private namedEventEmission(
    r: RainfallReading,
    postcode: string,
    dateIso: string
  ): FraudSignalEmission {
    return {
      category: 'ENVIRONMENTAL',
      signalType: 'named_event_match',
      severity: SignalSeverity.INFO,
      confidence: r.confidence,
      message: `Claim falls within recognised event: ${r.namedEventRef}.`,
      rawData: {
        postcode,
        date: dateIso,
        eventRef: r.namedEventRef,
      },
    };
  }
}
