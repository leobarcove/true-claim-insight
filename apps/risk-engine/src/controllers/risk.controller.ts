import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AnalysisQueue } from '../processors/analysis.queue';
import { PrismaService } from '../config/prisma.service';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { TenantIsolation, TenantScope, Tenant } from '../common/decorators/tenant.decorator';
import { TenantService } from '../tenant/tenant.service';

@Controller('risk')
@UseGuards(InternalAuthGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class RiskController {
  private readonly logger = new Logger(RiskController.name);

  constructor(
    private readonly queue: AnalysisQueue,
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService
  ) {}

  @Post('analyze/:documentId')
  @HttpCode(HttpStatus.ACCEPTED)
  async analyzeDocument(@Param('documentId') documentId: string, @Tenant() tenantContext: TenantContext) {
    this.logger.log(`Received analysis request for document ${documentId}`);

    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (doc) {
        await this.tenantService.validateClaimAccess(doc.claimId, tenantContext);
    }

    try {
      this.queue.addJob(documentId);
      return { status: 'queued', documentId };
    } catch (e) {
      this.logger.error(`Failed to queue analysis: ${e}`);
      return { status: 'failed', error: (e as Error).message };
    }
  }

  @Get('claims/:claimId/trinity')
  async getTrinityCheck(@Param('claimId') claimId: string, @Tenant() tenantContext: TenantContext) {
    await this.tenantService.validateClaimAccess(claimId, tenantContext);

    const check = await this.prisma.trinityCheck.findFirst({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });

    if (check) {
      const sanitized = { ...check } as any;
      if (sanitized?.reasoningInsights?.model) {
        delete sanitized.reasoningInsights.model;
      }
      return sanitized;
    }

    return null;
  }

  @Get('documents/:documentId/analysis')
  async getDocumentAnalysis(@Param('documentId') documentId: string, @Tenant() tenantContext: TenantContext) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (doc) {
        await this.tenantService.validateClaimAccess(doc.claimId, tenantContext);
    }

    const analysis = await this.prisma.documentAnalysis.findUnique({
      where: { documentId },
    });

    if (analysis) {
      const { modelUsed, ...sanitized } = analysis as any;
      return sanitized;
    }

    return null;
  }
}
