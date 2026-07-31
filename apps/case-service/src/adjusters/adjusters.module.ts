import { Module } from '@nestjs/common';
import { AdjustersController } from './adjusters.controller';
import { AdjustersService } from './adjusters.service';
import { CompetencyService } from './competency.service';
import { ConflictsService } from './conflicts.service';
import { CpdService } from './cpd.service';

@Module({
  controllers: [AdjustersController],
  providers: [AdjustersService, CompetencyService, ConflictsService, CpdService],
  exports: [AdjustersService, ConflictsService],
})
export class AdjustersModule {}
