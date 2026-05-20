import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from './config/prisma.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { LlmModule } from './llm/llm.module';
import { TrinityCheckEngine } from './trinity/trinity.engine';
import { DocumentProcessorService } from './processors/document-processor.service';
import { AnalysisQueue } from './processors/analysis.queue';
import { RiskController } from './controllers/risk.controller';
import { ExtractionModule } from './processors/extraction/extraction.module';
import { TenantModule } from './tenant/tenant.module';
import { EventsGateway } from './trinity/events.gateway';
import { StorageService } from './common/services/storage.service';
import { TrinityReportGenerator } from './trinity/trinity-report.generator';
import { FraudSignalsModule } from './fraud-signals/fraud-signals.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Load order: service-local .env first (overrides), then project
      // root .env (shared secrets like GEMINI_API_KEY).
      envFilePath: ['.env', '.env.local', '../../.env'],
    }),
    TerminusModule,
    PrismaModule,
    AssessmentsModule,
    ExtractionModule,
    TenantModule,
    FraudSignalsModule,
    LlmModule,
  ],
  controllers: [RiskController],
  providers: [
    TrinityCheckEngine,
    DocumentProcessorService,
    AnalysisQueue,
    EventsGateway,
    StorageService,
    TrinityReportGenerator,
  ],
})
export class AppModule {}
