import { Module } from '@nestjs/common';
import { AdjustersController } from './adjusters.controller';
import { AdjustersService } from './adjusters.service';
import { CompetencyService } from './competency.service';

@Module({
  controllers: [AdjustersController],
  providers: [AdjustersService, CompetencyService],
  exports: [AdjustersService],
})
export class AdjustersModule {}
