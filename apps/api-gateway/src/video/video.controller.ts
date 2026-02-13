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
  Res,
  Delete,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { VideoService } from './video.service';
import { CreateRoomDto, JoinRoomDto, EndRoomDto, SaveClientInfoDto } from './dto/video.dto';

@ApiTags('video')
@Controller('video')
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@ApiBearerAuth('access-token')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('rooms')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Create a video room (Adjuster only)' })
  async createRoom(@Body() dto: CreateRoomDto, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    try {
      return await this.videoService.createRoom(dto, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('rooms')
  @ApiOperation({ summary: 'Get all video sessions' })
  async getAllSessions(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentTenant() tenantId?: string,
    @CurrentUser() user?: any
  ) {
    try {
      return await this.videoService.getAllSessions(tenantId, page, limit, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: 'Get room details' })
  async getRoom(@Param('id') id: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    try {
      return await this.videoService.getRoom(id, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('rooms/:id/join')
  @ApiOperation({ summary: 'Join a video room and get Daily.co token' })
  async joinRoom(
    @Param('id') id: string,
    @Body() dto: JoinRoomDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      return await this.videoService.joinRoom(id, dto, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('rooms/:id/client-info')
  @ApiOperation({ summary: 'Save client information for a session' })
  async saveClientInfo(
    @Param('id') id: string,
    @Body() dto: SaveClientInfoDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      return await this.videoService.saveClientInfo(id, dto, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('rooms/:id/end')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'End a video session (Adjuster only)' })
  async endRoom(
    @Param('id') id: string,
    @Body() dto: EndRoomDto,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      return await this.videoService.endRoom(id, dto, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('claims/:claimId/sessions')
  @ApiOperation({ summary: 'Get all video sessions for a claim' })
  async getSessions(@Param('claimId') claimId: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    try {
      return await this.videoService.getSessionsForClaim(claimId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('status')
  @ApiOperation({ summary: 'Check video provider status' })
  async getStatus() {
    try {
      return await this.videoService.getConfigStatus();
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  // --- Video Upload & Assessment Routes ---

  @Post('uploads/upload-assessment')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Upload a video for assessment' })
  async uploadAssessment(@Req() req: any, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    try {
      // For Fastify, we can pass the raw request through or use multipart utility
      // Here we assume the service handles the proxying of the stream/body
      return await this.videoService.uploadAssessment(req, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('uploads')
  @ApiOperation({ summary: 'Get all video uploads' })
  async getAllUploads(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentTenant() tenantId?: string,
    @CurrentUser() user?: any
  ) {
    try {
      return await this.videoService.getAllUploads(tenantId, page, limit, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('uploads/:uploadId')
  @ApiOperation({ summary: 'Get video upload details' })
  async getUpload(@Param('uploadId') uploadId: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    try {
      return await this.videoService.getUpload(uploadId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('uploads/:uploadId/segments')
  @ApiOperation({ summary: 'Get all analyzed segments for an upload' })
  async getUploadSegments(@Param('uploadId') uploadId: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    try {
      return await this.videoService.getUploadSegments(uploadId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('uploads/:uploadId/stream')
  @ApiOperation({ summary: 'Stream video from local storage' })
  async streamUpload(@Param('uploadId') uploadId: string, @Res() res: any, @Req() req: any) {
    try {
      return await this.videoService.streamUpload(uploadId, res, req);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('uploads/:uploadId/process-segment')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Process a video segment' })
  async processSegment(
    @Param('uploadId') uploadId: string,
    @Body() dto: { startTime: number; endTime: number },
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      return await this.videoService.processSegment(uploadId, dto, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('uploads/:uploadId/prepare')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Prepare video locally for processing' })
  async prepareUpload(@Param('uploadId') uploadId: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    try {
      return await this.videoService.prepareUpload(uploadId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('uploads/:uploadId/deception-score')
  @ApiOperation({ summary: 'Get deception score for uploaded video' })
  async getDeceptionScore(@Param('uploadId') uploadId: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    try {
      return await this.videoService.getDeceptionScore(uploadId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('uploads/:uploadId/generate-consent')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Generate consent form after processing' })
  async generateConsent(
    @Param('uploadId') uploadId: string,
    @Body() _body: any,
    @CurrentTenant() tenantId: string,
    @CurrentUser() user: any
  ) {
    try {
      return await this.videoService.generateConsent(uploadId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('uploads/claim/:claimId')
  @ApiOperation({ summary: 'Get all video uploads for a claim' })
  async getClaimUploads(@Param('claimId') claimId: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    try {
      return await this.videoService.getClaimUploads(claimId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Delete('uploads/:uploadId')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Delete a video upload' })
  async deleteUpload(@Param('uploadId') uploadId: string, @CurrentTenant() tenantId: string, @CurrentUser() user: any) {
    try {
      return await this.videoService.deleteUpload(uploadId, tenantId, user?.id || user?.sub, user?.role);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }
}
