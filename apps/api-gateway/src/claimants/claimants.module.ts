import { Module } from '@nestjs/common';
import { ClaimantsService } from './claimants.service';

@Module({
  providers: [ClaimantsService],
  exports: [ClaimantsService],
})
export class ClaimantsModule {}
