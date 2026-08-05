import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { ClaimsModule } from './claims/claims.module';
import { AdjustersModule } from './adjusters/adjusters.module';
import { CasesModule } from './cases/cases.module';
import { DocumentsModule } from './documents/documents.module';
import { FloodClaimsModule } from './flood-claims/flood-claims.module';
import { PoliciesModule } from './policies/policies.module';
import { HealthModule } from './health/health.module';
import { SignaturesModule } from './signatures/signatures.module';
import { PrismaModule } from './config/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { QueueModule } from './queue/queue.module';
import { ReportsModule } from './reports/reports.module';
import { ConsentModule } from './consent/consent.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { RetentionModule } from './retention/retention.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ExportModule } from './export/export.module';
import { ComplianceModule } from './compliance/compliance.module';
import { BillingModule } from './billing/billing.module';
import { TenantModule } from './tenant/tenant.module';
import configuration from './config/configuration';
import { AuditModule } from './common/audit/audit.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: ['.env', '../../.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,
        limit: 10,
      },
      {
        name: 'medium',
        ttl: 10000,
        limit: 50,
      },
      {
        name: 'long',
        ttl: 60000,
        limit: 200,
      },
    ]),

    // Database
    PrismaModule,
    AuditModule,

    // Field-level encryption for personal data (PDPA)
    CryptoModule,

    // Durable background work (SLA clocks, notifications, retention)
    QueueModule,
    ReportsModule,
    ConsentModule,
    AssignmentsModule,
    RetentionModule,
    IngestionModule,
    NotificationsModule,
    ExportModule,
    ComplianceModule,
    BillingModule,

    // Multi-tenancy
    TenantModule,

    // Feature modules
    ClaimsModule,
    AdjustersModule,
    CasesModule,
    DocumentsModule,
    FloodClaimsModule,
    PoliciesModule,
    HealthModule,
    SignaturesModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
