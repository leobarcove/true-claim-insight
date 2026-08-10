import { Module } from '@nestjs/common';
import { InternalHttpModule } from '../common/internal-http.module';
import { ConfigModule } from '@nestjs/config';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';
import { FraudSignalsController } from './fraud-signals.controller';

@Module({
  imports: [InternalHttpModule, ConfigModule],
  controllers: [RiskController, FraudSignalsController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
