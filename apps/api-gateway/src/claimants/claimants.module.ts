import { Module } from '@nestjs/common';
import { ClaimantsService } from './claimants.service';
import { ClaimantsController } from './claimants.controller';
import { ClaimantIdentityController } from './claimant-identity.controller';

@Module({
  controllers: [ClaimantsController, ClaimantIdentityController],
  providers: [ClaimantsService],
  exports: [ClaimantsService],
})
export class ClaimantsModule {}
