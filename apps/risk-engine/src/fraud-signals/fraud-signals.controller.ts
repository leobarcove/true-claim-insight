import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { FraudSignalOrchestrator } from './fraud-signal-orchestrator.service';

/**
 * Minimal HTTP surface for fraud signals. This is the "skeleton" of the
 * provider plugin architecture — concrete providers (MetMalaysia, JPS, etc.)
 * are added by registering them in FraudSignalsModule. The orchestrator
 * routes each claim through every applicable provider.
 *
 * In production these endpoints would be called by:
 *  - case-service: automatically after claim creation (post-FNOL hook)
 *  - assessments pipeline: re-evaluation when new evidence arrives
 *  - adjuster UI: manual "re-run risk checks" button
 */
@ApiTags('fraud-signals')
@Controller({ path: 'fraud-signals', version: '1' })
export class FraudSignalsController {
  constructor(private readonly orchestrator: FraudSignalOrchestrator) {}

  @Post('claims/:claimId/evaluate')
  @ApiOperation({
    summary: 'Run all applicable fraud-signal providers for a claim',
  })
  evaluate(@Param('claimId', ParseUUIDPipe) claimId: string) {
    return this.orchestrator.evaluateClaim(claimId);
  }

  @Get('claims/:claimId')
  @ApiOperation({ summary: 'List persisted fraud signals for a claim' })
  list(@Param('claimId', ParseUUIDPipe) claimId: string) {
    return this.orchestrator.listForClaim(claimId);
  }
}
