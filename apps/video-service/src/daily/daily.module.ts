import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DailyService } from './daily.service';

@Module({
  imports: [ConfigModule],
  providers: [DailyService],
  exports: [DailyService],
})
export class DailyModule {}
