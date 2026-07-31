import { Module } from '@nestjs/common';
import { PrismaModule } from '../config/prisma.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
