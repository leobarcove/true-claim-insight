import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module';
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
import { IngestionProxyModule } from './ingestion/ingestion.module';
import { TenantConfigModule } from './tenant-config/tenant-config.module';
import { RetentionModule } from './retention/retention.module';
import { ClaimantsModule } from './claimants/claimants.module';
import { LocationModule } from './location/location.module';
import { RiskModule } from './risk/risk.module';
import { OcrModule } from './ocr/ocr.module';
import { MasterDataModule } from './master-data/master-data.module';
import configuration from './config/configuration';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env.local', '.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
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
    ]),

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
