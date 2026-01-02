import { Module } from '@nestjs/common';
import { VideoController } from './video.controller';
import { VideoService } from './video.service';
import { AuthModule } from '../auth/auth.module';
import { RiskModule } from '../risk/risk.module';

@Module({
  imports: [AuthModule, RiskModule],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
