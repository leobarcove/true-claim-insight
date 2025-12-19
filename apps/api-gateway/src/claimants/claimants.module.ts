import { Module } from '@nestjs/common';
import { ClaimantsService } from './claimants.service';
import { ClaimantsController } from './claimants.controller';

@Module({
  controllers: [ClaimantsController],
  providers: [ClaimantsService],
  exports: [ClaimantsService],
})
export class ClaimantsModule {}
