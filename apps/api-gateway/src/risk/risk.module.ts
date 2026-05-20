import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';
import { FraudSignalsController } from './fraud-signals.controller';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [RiskController, FraudSignalsController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
