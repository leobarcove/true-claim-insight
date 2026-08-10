import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { InternalHttpModule } from '../common/internal-http.module';
import { ReportsController } from './reports.controller';

@Module({
  imports: [InternalHttpModule, ConfigModule],
  controllers: [ReportsController],
})
export class ReportsModule {}
