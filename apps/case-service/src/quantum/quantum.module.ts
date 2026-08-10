import { Module } from '@nestjs/common';

import { PrismaModule } from '../config/prisma.module';
import { QuantumController } from './quantum.controller';
import { QuantumService } from './quantum.service';

/**
 * Quantum worksheets (MASTER_PLAN §5 Phase 2) — prod for fire and property,
 * demonstrable for other lines.
 *
 * The calculator is a pure function with no dependency on this module, so the
 * ordering rules are testable without a database and are exercised in CI.
 */
@Module({
  imports: [PrismaModule],
  controllers: [QuantumController],
  providers: [QuantumService],
  exports: [QuantumService],
})
export class QuantumModule {}
