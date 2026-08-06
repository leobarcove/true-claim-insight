import { Module } from '@nestjs/common';

import { PrismaModule } from '../config/prisma.module';
import { AssessmentController } from './assessment.controller';
import { AssessmentService } from './assessment.service';

/**
 * Assessment-mode router (MASTER_PLAN §2.4).
 *
 * The routing rules are a pure function with no dependency on this module, so
 * the four fast-track conditions and the escalation ladder run in CI without a
 * database.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AssessmentController],
  providers: [AssessmentService],
  exports: [AssessmentService],
})
export class AssessmentModule {}
