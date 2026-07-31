import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './config/prisma.module';
import { HealthModule } from './health/health.module';
import { DailyModule } from './daily/daily.module';
import { RoomsModule } from './rooms/rooms.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { UploadsModule } from './uploads/uploads.module';
import { TenantModule } from './tenant/tenant.module';
import { AuditModule } from './common/audit/audit.module';

@Module({
  imports: [
    AuditModule,
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      // Root .env last, so a service-local file can override it. Without the
      // root entry the internal-auth key was invisible here and the guard
      // failed closed — every internal call to this service was refused.
      envFilePath: ['.env', '.env.local', '../../.env'],
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Database
    PrismaModule,

    // Feature modules
    HealthModule,
    DailyModule,
    RoomsModule,
    WebhooksModule,
    UploadsModule,
    TenantModule,
  ],
})
export class AppModule {}
