import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Logger,
  Req,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerResponse,
  ApiConsumes,
  ApiBody,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import { FastifyRequest } from 'fastify';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { TenantIsolation, TenantScope, Tenant } from '../common/decorators/tenant.decorator';

@ApiTags('Assessments')
@ApiBearerAuth()
@Controller('assessments')
@UseGuards(InternalAuthGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class AssessmentsController {
  private readonly logger = new Logger(AssessmentsController.name);

  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get risk assessments for a video session' })
  @SwaggerResponse({ status: 200, description: 'List of risk assessments' })
  async getAssessments(@Param('sessionId') sessionId: string, @Tenant() tenantContext: TenantContext) {
    return this.assessmentsService.getAssessmentsBySession(sessionId, tenantContext);
  }

  @Get('session/:sessionId/deception-score')
  @ApiOperation({ summary: 'Get deception score for a session' })
  @SwaggerResponse({ status: 200, description: 'Deception score analysis' })
  async getDeceptionScore(@Param('sessionId') sessionId: string, @Tenant() tenantContext: TenantContext) {
    return this.assessmentsService.calculateDeceptionScore(sessionId, tenantContext);
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Trigger a mock risk assessment' })
  @SwaggerResponse({ status: 201, description: 'Assessment triggered' })
  async triggerAssessment(
    @Body('sessionId') sessionId: string,
    @Body('assessmentType') assessmentType: string,
    @Tenant() tenantContext: TenantContext
  ) {
    this.logger.log(`Triggering ${assessmentType} assessment for session ${sessionId}`);
    return this.assessmentsService.triggerMockAssessment(sessionId, assessmentType, tenantContext);
  }

  @Post('session/:sessionId/consent-form')
  @ApiOperation({ summary: 'Generate PIAM Consent Form' })
  @SwaggerResponse({ status: 201, description: 'Consent form generated' })
  async generateConsent(@Param('sessionId') sessionId: string, @Tenant() tenantContext: TenantContext) {
    this.logger.log(`Generating consent form for session ${sessionId}`);
    return this.assessmentsService.generateConsentForm(sessionId, tenantContext);
  }

  @Post('upload-audio')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sessionId: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload and analyze claimant audio' })
  async uploadAudio(@Req() req: FastifyRequest, @Tenant() tenantContext: TenantContext) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Request is not multipart');
    }

    let audioBuffer: Buffer | null = null;
    let sessionId: string | null = null;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'file') {
          audioBuffer = await part.toBuffer();
        } else {
          await part.toBuffer();
        }
      } else {
        if (part.fieldname === 'sessionId') {
          sessionId = part.value as string;
        }
      }
    }

    if (!audioBuffer) {
      throw new BadRequestException('No audio file uploaded');
    }

    if (!sessionId) {
      const query = req.query as any;
      sessionId = query.sessionId;
    }

    if (!sessionId) {
        throw new BadRequestException('Session ID is required');
    }

    this.logger.log(
      `Received audio upload for session ${sessionId}, size: ${audioBuffer.length} bytes`
    );
    return this.assessmentsService.processUploadedAudio(audioBuffer, sessionId, tenantContext);
  }

  @Post('analyze-expression')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sessionId: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Analyze expression from video buffer' })
  async analyzeExpression(@Req() req: FastifyRequest, @Tenant() tenantContext: TenantContext) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Request is not multipart');
    }

    let videoBuffer: Buffer | null = null;
    let sessionId: string | null = null;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'file') {
          videoBuffer = await part.toBuffer();
        } else {
          await part.toBuffer();
        }
      } else {
        if (part.fieldname === 'sessionId') {
          sessionId = part.value as string;
        }
      }
    }

    if (!videoBuffer) {
      throw new BadRequestException('No video file uploaded');
    }

    if (!sessionId) {
      const query = req.query as any;
      sessionId = query.sessionId;
    }

    if (!sessionId) {
        throw new BadRequestException('Session ID is required');
    }

    return this.assessmentsService.processUploadedExpression(videoBuffer, sessionId, tenantContext);
  }

  @Post('analyze-video')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        sessionId: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Analyze visual behavior from video buffer' })
  async analyzeVideo(@Req() req: FastifyRequest, @Tenant() tenantContext: TenantContext) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Request is not multipart');
    }

    let videoBuffer: Buffer | null = null;
    let sessionId: string | null = null;

    for await (const part of req.parts()) {
      if (part.type === 'file') {
        if (part.fieldname === 'file') {
          videoBuffer = await part.toBuffer();
        } else {
          await part.toBuffer();
        }
      } else {
        if (part.fieldname === 'sessionId') {
          sessionId = part.value as string;
        }
      }
    }

    if (!videoBuffer) {
      throw new BadRequestException('No video file uploaded');
    }

    if (!sessionId) {
      const query = req.query as any;
      sessionId = query.sessionId;
    }

    if (!sessionId) {
        throw new BadRequestException('Session ID is required');
    }

    return this.assessmentsService.processUploadedVideo(videoBuffer, sessionId, tenantContext);
  }

  @Get('analyzer-health')
  @TenantIsolation(TenantScope.NONE)
  @ApiOperation({ summary: 'Check if Python analyzer service is healthy' })
  @SwaggerResponse({ status: 200, description: 'Analyzer health status' })
  async getAnalyzerHealth() {
    const isHealthy = await this.assessmentsService.isAnalyzerHealthy();
    return {
      service: 'risk-analyzer',
      status: isHealthy ? 'healthy' : 'unhealthy',
      url: 'http://localhost:3005',
    };
  }

  @Post('analyze-session')
  @ApiOperation({ summary: 'Analyse a full session recording (post-session)' })
  @SwaggerResponse({ status: 201, description: 'Session analysis triggered' })
  async analyzeSession(@Body('sessionId') sessionId: string, @Tenant() tenantContext: TenantContext) {
    this.logger.log(`Analysing full session: ${sessionId}`);

    // Trigger both voice and visual analysis for the session
    const [voiceResult, visualResult] = await Promise.all([
      this.assessmentsService.triggerMockAssessment(sessionId, 'VOICE', tenantContext),
      this.assessmentsService.triggerMockAssessment(sessionId, 'VISUAL', tenantContext),
    ]);

    return {
      sessionId,
      analysisComplete: true,
      voiceAssessment: voiceResult,
      visualAssessment: visualResult,
    };
  }
}
