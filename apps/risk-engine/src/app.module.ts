import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaModule } from './config/prisma.module';
import { AssessmentsModule } from './assessments/assessments.module';
import { GpuClientService } from './llm/gpu-client.service';
import { TrinityCheckEngine } from './trinity/trinity.engine';
import { DocumentProcessorService } from './processors/document-processor.service';
import { AnalysisQueue } from './processors/analysis.queue';
import { RiskController } from './controllers/risk.controller';
import { ExtractionModule } from './processors/extraction/extraction.module';
import { TenantModule } from './tenant/tenant.module';
import { EventsGateway } from './trinity/events.gateway';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
    }),
    TerminusModule,
    PrismaModule,
    AssessmentsModule,
    ExtractionModule,
    TenantModule,
  ],
  controllers: [RiskController],
  providers: [
    GpuClientService,
    TrinityCheckEngine,
    DocumentProcessorService,
    AnalysisQueue,
    EventsGateway,
  ],
})
export class AppModule {}
