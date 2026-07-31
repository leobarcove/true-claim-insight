import { Module } from '@nestjs/common';
import { AdjustersController } from './adjusters.controller';
import { AdjustersService } from './adjusters.service';
import { CompetencyService } from './competency.service';
import { ConflictsService } from './conflicts.service';

@Module({
  controllers: [AdjustersController],
  providers: [AdjustersService, CompetencyService, ConflictsService],
  exports: [AdjustersService, ConflictsService],
})
export class AdjustersModule {}
