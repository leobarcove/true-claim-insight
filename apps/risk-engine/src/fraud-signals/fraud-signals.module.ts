import { Module } from '@nestjs/common';
import { PrismaModule } from '../config/prisma.module';
import { FraudSignalOrchestrator } from './fraud-signal-orchestrator.service';
import { FraudSignalsController } from './fraud-signals.controller';
import { MockBaselineProvider } from './providers/mock-baseline.provider';

/**
 * FraudSignals module — registers the orchestrator and every provider that
 * can emit signals. When adding a new provider:
 *  1. Implement FraudSignalProvider in providers/.
 *  2. Add it to this `providers` array and to the orchestrator's constructor.
 *  3. Re-export the orchestrator (already exported globally for risk scoring).
 */
@Module({
  imports: [PrismaModule],
  controllers: [FraudSignalsController],
  providers: [FraudSignalOrchestrator, MockBaselineProvider],
  exports: [FraudSignalOrchestrator],
})
export class FraudSignalsModule {}
