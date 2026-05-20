import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClaimsController } from './claims.controller';
import { SignaturesController } from './signatures.controller';
import { ConfigModule } from '@nestjs/config';
import { ClaimantsModule } from '../claimants/claimants.module';

@Module({
  imports: [HttpModule, ConfigModule, ClaimantsModule],
  controllers: [ClaimsController, SignaturesController],
})
export class ClaimsModule {}
