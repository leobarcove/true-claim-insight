import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { AnalysisQueue } from '../processors/analysis.queue';
import { PrismaService } from '../config/prisma.service';

@Controller('risk')
export class RiskController {
  private readonly logger = new Logger(RiskController.name);

  constructor(
    private readonly queue: AnalysisQueue,
    private readonly prisma: PrismaService
  ) {}

  @Post('analyze/:documentId')
  @HttpCode(HttpStatus.ACCEPTED)
  async analyzeDocument(@Param('documentId') documentId: string) {
    this.logger.log(`Received analysis request for document ${documentId}`);

    // Fire and forget using internal Job Queue
    try {
      this.queue.addJob(documentId);
      return { status: 'queued', documentId };
    } catch (e) {
      this.logger.error(`Failed to queue analysis: ${e}`);
      return { status: 'failed', error: (e as Error).message };
    }
  }

  @Get('claims/:claimId/trinity')
  async getTrinityCheck(@Param('claimId') claimId: string) {
    const check = await this.prisma.trinityCheck.findFirst({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });
    return check || null;
  }

  @Get('documents/:documentId/analysis')
  async getDocumentAnalysis(@Param('documentId') documentId: string) {
    const analysis = await this.prisma.documentAnalysis.findUnique({
      where: { documentId },
    });

    if (!analysis) throw new NotFoundException('Analysis not found');
    return analysis;
  }
}
