import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { InternalHttpModule } from '../common/internal-http.module';
import { BillingProxyController } from './billing.controller';

/**
 * Edge access to billing.
 *
 * There was none. The engine was complete in case-service and every route
 * behind it returned 404 from outside, so the firm's revenue step — the fee
 * note the whole engagement is for — could not be exercised at all.
 */
@Module({
  imports: [AuthModule, InternalHttpModule],
  controllers: [BillingProxyController],
})
export class BillingProxyModule {}
