import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';

/**
 * HttpModule pre-configured for internal service-to-service calls.
 *
 * The gateway authenticates the caller (JwtAuthGuard) and then forwards the
 * caller's identity to internal services as X-User-Id / X-Tenant-Id /
 * X-User-Role headers. Those headers are trusted by the receiving service, so
 * they must be accompanied by proof that the request really came from the
 * gateway — otherwise anyone who can reach an internal port can impersonate
 * any user of any tenant (see docs/MASTER_PLAN.md §4.3 A1).
 *
 * Setting the shared key as an axios *instance default* means no individual
 * call site can forget it: axios merges instance default headers into every
 * request, and there are ~27 header-building sites across the gateway.
 *
 * This is a shared-secret scheme — adequate for a single-operator deployment
 * with services on a private network. Replace with mTLS once real deployment
 * artefacts exist (§4.3 A5).
 */
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        headers: {
          'x-internal-key': config.get<string>('INTERNAL_API_KEY') ?? '',
        },
      }),
    }),
  ],
  exports: [HttpModule],
})
export class InternalHttpModule {}
