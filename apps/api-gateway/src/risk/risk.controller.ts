import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipTenantCheck } from '../auth/decorators/skip-tenant-check.decorator';
import { RiskService } from './risk.service';

@ApiTags('risk')
@Controller('risk')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@ApiBearerAuth('access-token')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get risk assessments for a session' })
  async getAssessments(
    @Param('sessionId') sessionId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      return await this.riskService.getAssessments(sessionId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('session/:sessionId/deception-score')
  @ApiOperation({ summary: 'Get deception score for a session' })
  async getDeceptionScore(
    @Param('sessionId') sessionId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      return await this.riskService.getDeceptionScore(sessionId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('assessments/trigger')
  @ApiOperation({ summary: 'Trigger a new assessment' })
  async triggerAssessment(
    @Body('sessionId') sessionId: string,
    @Body('assessmentType') assessmentType: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      return await this.riskService.triggerAssessment(
        sessionId,
        assessmentType,
        tenantId,
        user?.id || user?.sub,
        user?.role
      );
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('upload-audio')
  @Public()
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
  @ApiOperation({ summary: 'Upload claimant audio' })
  async uploadAudio(@Req() req: FastifyRequest) {
    if (!req.isMultipart()) {
      throw new HttpException('Request is not multipart', HttpStatus.BAD_REQUEST);
    }

    let audioBuffer: Buffer | null = null;
    let sessionId: string | null = null;

    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          if (part.fieldname === 'file') {
            audioBuffer = await part.toBuffer();
          } else {
            await part.toBuffer(); // Consume unused
          }
        } else {
          if (part.fieldname === 'sessionId') {
            sessionId = part.value as string;
          }
        }
      }

      if (!audioBuffer) {
        throw new HttpException('No audio file uploaded', HttpStatus.BAD_REQUEST);
      }

      if (!sessionId) {
        // Fallback to query param if needed
        const query = req.query as any;
        sessionId = query.sessionId || 'unknown';
      }

      return await this.riskService.uploadAudio(audioBuffer, sessionId as string, 'system', 'system', 'SYSTEM');
    } catch (error: any) {
      throw new HttpException(error.message || 'Upload failed', HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('upload-screenshot')
  @Public()
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
  @ApiOperation({ summary: 'Upload claimant screenshot' })
  async uploadScreenshot(@Req() req: FastifyRequest) {
    if (!req.isMultipart()) {
      throw new HttpException('Request is not multipart', HttpStatus.BAD_REQUEST);
    }

    let buf: Buffer | null = null;
    let sessionId: string | null = null;

    try {
      for await (const part of req.parts()) {
        if (part.type === 'file') {
          if (part.fieldname === 'file') {
            buf = await part.toBuffer();
          } else {
            await part.toBuffer();
          }
        } else {
          if (part.fieldname === 'sessionId') {
            sessionId = part.value as string;
          }
        }
      }

      if (!buf) {
        throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
      }

      if (!sessionId) {
        const query = req.query as any;
        sessionId = query.sessionId || 'unknown';
      }

      return await this.riskService.uploadScreenshot(buf, sessionId as string, 'system', 'system', 'SYSTEM');
    } catch (error: any) {
      throw new HttpException(error.message || 'Upload failed', HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('analyze-expression')
  @Public()
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
  @ApiOperation({ summary: 'Analyze expression from video' })
  async analyzeExpression(@Req() req: FastifyRequest) {
    if (!req.isMultipart()) {
      throw new HttpException('Request is not multipart', HttpStatus.BAD_REQUEST);
    }

    let videoBuffer: Buffer | null = null;
    let sessionId: string | null = null;

    try {
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
        throw new HttpException('No video file uploaded', HttpStatus.BAD_REQUEST);
      }

      if (!sessionId) {
        const query = req.query as any;
        sessionId = query.sessionId || 'unknown';
      }

      return await this.riskService.analyzeExpression(videoBuffer, sessionId as string, 'system', 'system', 'SYSTEM');
    } catch (error: any) {
      throw new HttpException(error.message || 'Upload failed', HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('analyze-video')
  @Public()
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
  @ApiOperation({ summary: 'Analyze visual behavior from video' })
  async analyzeVideo(@Req() req: FastifyRequest) {
    if (!req.isMultipart()) {
      throw new HttpException('Request is not multipart', HttpStatus.BAD_REQUEST);
    }

    let videoBuffer: Buffer | null = null;
    let sessionId: string | null = null;

    try {
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
        throw new HttpException('No video file uploaded', HttpStatus.BAD_REQUEST);
      }

      if (!sessionId) {
        const query = req.query as any;
        sessionId = query.sessionId || 'unknown';
      }

      return await this.riskService.analyzeVideo(videoBuffer, sessionId as string, 'system', 'system', 'SYSTEM');
    } catch (error: any) {
      throw new HttpException(error.message || 'Upload failed', HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('claims/:claimId/trinity')
  @ApiOperation({ summary: 'Get trinity check results for a claim' })
  async getTrinityCheck(
    @Param('claimId') claimId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      return await this.riskService.getTrinityCheck(claimId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('documents/:documentId/analysis')
  @ApiOperation({ summary: 'Get analysis for a document' })
  async getDocumentAnalysis(
    @Param('documentId') documentId: string,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      return await this.riskService.getDocumentAnalysis(documentId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }
}
