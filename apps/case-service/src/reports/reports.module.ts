import { Module } from '@nestjs/common';
import { PrismaModule } from '../config/prisma.module';
import { SlaModule } from '../sla/sla.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [PrismaModule, SlaModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
