import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ClaimsController } from './claims.controller';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [HttpModule, ConfigModule],
  controllers: [ClaimsController],
})
export class ClaimsModule {}
