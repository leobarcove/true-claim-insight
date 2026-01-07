import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

import { PrismaModule } from './config/prisma.module';
import { HealthModule } from './health/health.module';
import { DailyModule } from './daily/daily.module';
import { RoomsModule } from './rooms/rooms.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { UploadsModule } from './uploads/uploads.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '.env.local'],
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
  ],
})
export class AppModule {}
