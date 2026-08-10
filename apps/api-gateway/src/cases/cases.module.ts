import { Module } from '@nestjs/common';
import { InternalHttpModule } from '../common/internal-http.module';
import { ConfigModule } from '@nestjs/config';
import { CasesController, PoliciesController } from './cases.controller';
import { ClaimantsModule } from '../claimants/claimants.module';

@Module({
  imports: [InternalHttpModule, ConfigModule, ClaimantsModule],
  controllers: [CasesController, PoliciesController],
})
export class CasesModule {}
