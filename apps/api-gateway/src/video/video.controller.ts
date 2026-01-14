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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { VideoService } from './video.service';
import { CreateRoomDto, JoinRoomDto, EndRoomDto } from './dto/video.dto';

@ApiTags('video')
@Controller('video')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('rooms')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Create a video room (Adjuster only)' })
  async createRoom(@Body() dto: CreateRoomDto) {
    try {
      return await this.videoService.createRoom(dto);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: 'Get room details' })
  async getRoom(@Param('id') id: string) {
    try {
      return await this.videoService.getRoom(id);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('rooms/:id/join')
  @ApiOperation({ summary: 'Join a video room and get Daily.co token' })
  async joinRoom(@Param('id') id: string, @Body() dto: JoinRoomDto) {
    try {
      return await this.videoService.joinRoom(id, dto);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('rooms/:id/end')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'End a video session (Adjuster only)' })
  async endRoom(@Param('id') id: string, @Body() dto: EndRoomDto) {
    try {
      return await this.videoService.endRoom(id, dto);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('claims/:claimId/sessions')
  @ApiOperation({ summary: 'Get all video sessions for a claim' })
  async getSessions(@Param('claimId') claimId: string) {
    try {
      return await this.videoService.getSessionsForClaim(claimId);
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
  async uploadAssessment(@Req() req: any) {
    try {
      // For Fastify, we can pass the raw request through or use multipart utility
      // Here we assume the service handles the proxying of the stream/body
      return await this.videoService.uploadAssessment(req);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('uploads/:uploadId')
  @ApiOperation({ summary: 'Get video upload details' })
  async getUpload(@Param('uploadId') uploadId: string) {
    try {
      return await this.videoService.getUpload(uploadId);
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
    @Body() dto: { startTime: number; endTime: number }
  ) {
    try {
      return await this.videoService.processSegment(uploadId, dto);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('uploads/:uploadId/prepare')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Prepare video locally for processing' })
  async prepareUpload(@Param('uploadId') uploadId: string) {
    try {
      return await this.videoService.prepareUpload(uploadId);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('uploads/:uploadId/deception-score')
  @ApiOperation({ summary: 'Get deception score for uploaded video' })
  async getDeceptionScore(@Param('uploadId') uploadId: string) {
    try {
      return await this.videoService.getDeceptionScore(uploadId);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('uploads/:uploadId/generate-consent')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Generate consent form after processing' })
  async generateConsent(@Param('uploadId') uploadId: string, @Body() _body?: any) {
    try {
      return await this.videoService.generateConsent(uploadId);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Get('uploads/claim/:claimId')
  @ApiOperation({ summary: 'Get all video uploads for a claim' })
  async getClaimUploads(@Param('claimId') claimId: string) {
    try {
      return await this.videoService.getClaimUploads(claimId);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Delete('uploads/:uploadId')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Delete a video upload' })
  async deleteUpload(@Param('uploadId') uploadId: string) {
    try {
      return await this.videoService.deleteUpload(uploadId);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }
}
