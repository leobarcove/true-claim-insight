import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { InternalHttpModule } from '../common/internal-http.module';
import { QuantumProxyController } from './quantum.controller';

@Module({
  imports: [InternalHttpModule, ConfigModule],
  controllers: [QuantumProxyController],
})
export class QuantumProxyModule {}
