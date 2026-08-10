import { Module } from '@nestjs/common';
import { InternalHttpModule } from '../common/internal-http.module';
import { ClaimsController } from './claims.controller';
import { SignaturesController } from './signatures.controller';
import { ConfigModule } from '@nestjs/config';
import { ClaimantsModule } from '../claimants/claimants.module';

@Module({
  imports: [InternalHttpModule, ConfigModule, ClaimantsModule],
  controllers: [ClaimsController, SignaturesController],
})
export class ClaimsModule {}
