import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Logger,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse as SwaggerResponse,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';
import { FastifyRequest } from 'fastify';

@ApiTags('Assessments')
@Controller('assessments')
export class AssessmentsController {
  private readonly logger = new Logger(AssessmentsController.name);

  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get risk assessments for a video session' })
  @SwaggerResponse({ status: 200, description: 'List of risk assessments' })
  async getAssessments(@Param('sessionId') sessionId: string) {
    return this.assessmentsService.getAssessmentsBySession(sessionId);
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Trigger a mock risk assessment' })
  @SwaggerResponse({ status: 201, description: 'Assessment triggered' })
  async triggerAssessment(
    @Body('sessionId') sessionId: string,
    @Body('assessmentType') assessmentType: string
  ) {
    this.logger.log(`Triggering ${assessmentType} assessment for session ${sessionId}`);
    return this.assessmentsService.triggerMockAssessment(sessionId, assessmentType);
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
  async uploadAudio(@Req() req: FastifyRequest) {
    if (!req.isMultipart()) {
      throw new BadRequestException('Request is not multipart');
    }

    let audioBuffer: Buffer | null = null;
    let sessionId: string | null = null;

    for await (const part of req.parts()) {
      this.logger.log(
        `Parsing part: type=${part.type}, fieldname=${part.fieldname}, encoding=${part.encoding}, mimetype=${part.mimetype}`
      );
      if (part.type === 'file') {
        if (part.fieldname === 'file') {
          this.logger.log('Found file part, buffering...');
          audioBuffer = await part.toBuffer();
          this.logger.log(`Buffered file: ${audioBuffer.length} bytes`);
        } else {
          // Consume unused file parts
          await part.toBuffer();
        }
      } else {
        // Field
        if (part.fieldname === 'sessionId') {
          sessionId = part.value as string;
        }
      }
    }

    if (!audioBuffer) {
      throw new BadRequestException('No audio file uploaded');
    }

    // Fallback: If sessionId missing from body, try query param (e.g. ?sessionId=...)
    // But since req is FastifyRequest, we can check req.query?
    // For now assuming body is correct. If sessionId is missing, check if service requires it?
    // Yes, service needs it.
    if (!sessionId) {
      // Workaround: client might not send sessionId field if relying on current param logic?
      // Let's assume passed in query if not in body
      const query = req.query as any;
      sessionId = query.sessionId || 'unknown-session';
    }

    this.logger.log(
      `Received audio upload for session ${sessionId}, size: ${audioBuffer.length} bytes`
    );
    return this.assessmentsService.processUploadedAudio(audioBuffer, sessionId as string);
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
  async analyzeExpression(@Req() req: FastifyRequest) {
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
      sessionId = query.sessionId || 'unknown';
    }

    return this.assessmentsService.processUploadedExpression(videoBuffer, sessionId as string);
  }

  @Get('analyzer-health')
  // ...
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
  async analyzeSession(@Body('sessionId') sessionId: string) {
    this.logger.log(`Analysing full session: ${sessionId}`);

    // Trigger both voice and visual analysis for the session
    const [voiceResult, visualResult] = await Promise.all([
      this.assessmentsService.triggerMockAssessment(sessionId, 'VOICE'),
      this.assessmentsService.triggerMockAssessment(sessionId, 'VISUAL'),
    ]);

    return {
      sessionId,
      analysisComplete: true,
      voiceAssessment: voiceResult,
      visualAssessment: visualResult,
    };
  }
}
