import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InternalHttpModule } from '../common/internal-http.module';
import { SlaProxyController } from './sla.controller';

/**
 * Edge access to the SLA clocks.
 *
 * Imports `InternalHttpModule` rather than calling with `fetch`: the video
 * module did the latter, forgot the internal key, and returned 502 on every
 * request until it was found. The axios instance carries the key as a default
 * so this module cannot repeat that.
 */
@Module({
  imports: [AuthModule, InternalHttpModule],
  controllers: [SlaProxyController],
})
export class SlaProxyModule {}
