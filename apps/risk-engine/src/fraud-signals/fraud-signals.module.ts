import { Module } from '@nestjs/common';
import { PrismaModule } from '../config/prisma.module';
import { FraudSignalOrchestrator } from './fraud-signal-orchestrator.service';
import { FraudSignalsController } from './fraud-signals.controller';
import { MockBaselineProvider } from './providers/mock-baseline.provider';
import { MetMalaysiaRainfallProvider } from './providers/met-malaysia-rainfall.provider';
import {
  RAINFALL_DATA_SOURCE,
  StubRainfallDataSource,
} from './providers/rainfall-data-source';

/**
 * FraudSignals module — registers the orchestrator and every provider that
 * can emit signals. When adding a new provider:
 *  1. Implement FraudSignalProvider in providers/.
 *  2. Add it to this `providers` array and to the orchestrator's constructor.
 *  3. Re-export the orchestrator (already exported globally for risk scoring).
 *
 * The RainfallDataSource is bound via a symbol token so a real
 * MetMalaysiaApiDataSource implementation can be dropped in later by
 * changing only this useClass binding.
 */
@Module({
  imports: [PrismaModule],
  controllers: [FraudSignalsController],
  providers: [
    FraudSignalOrchestrator,
    MockBaselineProvider,
    MetMalaysiaRainfallProvider,
    // Swap useClass to MetMalaysiaApiDataSource when an API key is wired
    // through environment config. Same interface, no provider changes.
    { provide: RAINFALL_DATA_SOURCE, useClass: StubRainfallDataSource },
  ],
  exports: [FraudSignalOrchestrator],
})
export class FraudSignalsModule {}
