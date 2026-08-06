import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { InternalHttpModule } from '../common/internal-http.module';
import { IngestionProxyController } from './ingestion.controller';

@Module({
  imports: [InternalHttpModule, ConfigModule],
  controllers: [IngestionProxyController],
})
export class IngestionProxyModule {}
