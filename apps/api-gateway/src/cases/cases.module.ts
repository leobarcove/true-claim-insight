import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { CasesController, PoliciesController } from './cases.controller';
import { ClaimantsModule } from '../claimants/claimants.module';

@Module({
  imports: [HttpModule, ConfigModule, ClaimantsModule],
  controllers: [CasesController, PoliciesController],
})
export class CasesModule {}
