import { Module } from '@nestjs/common';
import { PrismaModule } from '../config/prisma.module';
import { SlaModule } from '../sla/sla.module';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [PrismaModule, SlaModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}
