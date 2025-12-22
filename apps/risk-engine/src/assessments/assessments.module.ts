import { Module } from '@nestjs/common';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { RiskAnalyzerClient } from '../providers/risk-analyzer.client';

@Module({
  controllers: [AssessmentsController],
  providers: [AssessmentsService, RiskAnalyzerClient],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
