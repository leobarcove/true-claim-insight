import { Module } from '@nestjs/common';
import { PrismaModule } from '../config/prisma.module';
import { AdjustersModule } from '../adjusters/adjusters.module';
import { SlaModule } from '../sla/sla.module';
import { ReportsController } from './reports.controller';
import { QualityReviewService } from './quality-review.service';
import { ReportsService } from './reports.service';

@Module({
  imports: [PrismaModule, SlaModule, AdjustersModule],
  controllers: [ReportsController],
  providers: [ReportsService, QualityReviewService],
  exports: [ReportsService],
})
export class ReportsModule {}
