import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, type ThrottlerOptions } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './config/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { AuditLogInterceptor } from './common/interceptors/audit-log.interceptor';
import { AuditModule } from './common/audit/audit.module';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { VideoModule } from './video/video.module';
import { CasesModule } from './cases/cases.module';
import { ReportsModule } from './reports/reports.module';
import { ClaimsModule } from './claims/claims.module';
import { QuantumProxyModule } from './quantum/quantum.module';
import { BillingProxyModule } from './billing/billing.module';
import { SlaProxyModule } from './sla/sla.module';
import { ConsentProxyModule } from './consent/consent.module';
import { ConversationsProxyModule } from './conversations/conversations.module';
import { IngestionProxyModule } from './ingestion/ingestion.module';
import { TenantConfigModule } from './tenant-config/tenant-config.module';
import { RetentionModule } from './retention/retention.module';
import { ClaimantsModule } from './claimants/claimants.module';
import { LocationModule } from './location/location.module';
import { RiskModule } from './risk/risk.module';
import { OcrModule } from './ocr/ocr.module';
import { MasterDataModule } from './master-data/master-data.module';
import configuration from './config/configuration';

const THROTTLERS: ThrottlerOptions[] = [
  {
    // MUST exist, and must be called 'default'.
    //
    // Five routes carry `@Throttle({ default: … })` — registration,
    // login, claimant OTP send and verify, and NRIC verification — and an
    // override names the throttler it overrides. With no throttler called
    // 'default', every one of those was a no-op: the tightest limits in
    // the system, including 5 OTP sends an hour, silently fell back to
    // the general tiers below and nobody could tell from reading the
    // route, which says exactly what was intended.
    name: 'default',
    ttl: 60000,
    limit: 120,
  },
  {
    name: 'short',
    ttl: 1000, // 1 second
    limit: 10, // 10 requests per second
  },
  {
    name: 'medium',
    ttl: 10000, // 10 seconds
    limit: 50, // 50 requests per 10 seconds
  },
  {
    name: 'long',
    ttl: 60000, // 1 minute
    limit: 100, // 100 requests per minute
  },
];

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting. Counts live in Redis, so every copy of the gateway shares
    // one budget per client: in memory, N copies would each allow the full
    // limit — five OTP sends an hour becomes 5×N, and the limits that matter
    // most are the ones on login and OTP. Without REDIS_URL (a bare local
    // run), counting falls back to this process, and says so.
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('REDIS_URL');
        if (!url) {
          new Logger('Throttler').warn(
            'REDIS_URL not set — rate limits are counted per process, not shared across copies'
          );
          return { throttlers: THROTTLERS };
        }
        // Prefixed: this Redis also carries case-service's BullMQ queues.
        const redis = new Redis(url, { keyPrefix: 'tci:throttle:' });
        return { throttlers: THROTTLERS, storage: new ThrottlerStorageRedisService(redis) };
      },
    }),

    // Database
    PrismaModule,

    // Field-level encryption of personal data (PDPA)
    CryptoModule,

    // Feature modules
    AuthModule,
    UsersModule,
    VideoModule,
    AuditModule,
    CasesModule,
    ReportsModule,
    ClaimsModule,
    QuantumProxyModule,
    SlaProxyModule,
    BillingProxyModule,
    ConsentProxyModule,
    ConversationsProxyModule,
    IngestionProxyModule,
    TenantConfigModule,
    RetentionModule,
    ClaimantsModule,
    HealthModule,
    LocationModule,
    RiskModule,
    OcrModule,
    MasterDataModule,
  ],
  providers: [
    // Global rate limiting guard
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    // Authentication, then authorisation — both global and in this order, so
    // no controller can forget either. The roles guard denies any route that
    // declares no access rule (see auth/decorators/access.decorator.ts).
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    // Global response transformation
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // Global audit logging
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLogInterceptor,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
