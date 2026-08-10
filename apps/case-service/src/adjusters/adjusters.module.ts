import { Module } from '@nestjs/common';
import { ComplianceModule } from '../compliance/compliance.module';
import { AdjustersController } from './adjusters.controller';
import { AdjustersService } from './adjusters.service';
import { CompetencyService } from './competency.service';
import { ConflictsService } from './conflicts.service';
import { CpdService } from './cpd.service';
import { ScreeningService } from './screening.service';

@Module({
  // ComplianceModule: ConflictsService raises a Board event when an adjuster
  // attests a conflict (PD 11.2(d)).
  imports: [ComplianceModule],
  controllers: [AdjustersController],
  providers: [AdjustersService, CompetencyService, ConflictsService, CpdService, ScreeningService],
  exports: [AdjustersService, ConflictsService],
})
export class AdjustersModule {}
