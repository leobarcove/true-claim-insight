import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { InternalHttpModule } from '../common/internal-http.module';
import { ConsentProxyController } from './consent.controller';

@Module({
  imports: [InternalHttpModule, ConfigModule],
  controllers: [ConsentProxyController],
})
export class ConsentProxyModule {}
