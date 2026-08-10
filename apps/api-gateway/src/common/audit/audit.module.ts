import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../config/prisma.module';
import { AuditService } from './audit.service';

/**
 * Global so the app-wide AuditLogInterceptor can inject it, and so any module
 * needing to record a domain event does not have to wire it up again.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
