import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';

// Ensure upload directory exists
const uploadDir = './uploads/videos';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

@ApiTags('video-uploads')
@Controller('uploads')
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('upload-assessment')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload a video for assessment' })
  @ApiResponse({ status: 201, description: 'Video uploaded successfully' })
  async uploadVideo(@Req() req: any) {
    // Fastify-specific multipart handling
    if (!req.isMultipart()) {
      throw new BadRequestException('Request must be multipart');
    }

    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No file uploaded');
    }

    // Validate file type
    if (!data.mimetype.startsWith('video/')) {
      throw new BadRequestException('Only video files are allowed');
    }

    // claimId is usually sent as a field in multipart
    const claimId = data.fields?.claimId?.value;
    if (!claimId) {
      throw new BadRequestException('Claim ID is required');
    }

    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `video-${uniqueSuffix}${extname(data.filename)}`;
    const filePath = path.join(uploadDir, filename);

    // Stream the file to disk
    await pipeline(data.file, fs.createWriteStream(filePath));

    // Get file size
    const stats = fs.statSync(filePath);

    const upload = await this.uploadsService.createUpload(
      claimId,
      data.filename,
      stats.size,
      data.mimetype,
      filePath
    );

    return {
      data: {
        id: upload.id,
        videoUrl: `/uploads/videos/${filename}`,
        duration: upload.duration || 0,
        status: upload.status,
        claimId: upload.claimId,
        createdAt: upload.createdAt,
      },
    };
  }

  @Get(':uploadId')
  @ApiOperation({ summary: 'Get video upload details' })
  @ApiResponse({ status: 200, description: 'Upload details retrieved' })
  @ApiResponse({ status: 404, description: 'Upload not found' })
  async getUpload(@Param('uploadId') uploadId: string) {
    const upload = await this.uploadsService.getUpload(uploadId);
    return {
      data: upload,
    };
  }

  @Post(':uploadId/process-segment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process a video segment' })
  @ApiResponse({ status: 200, description: 'Segment processed' })
  async processSegment(
    @Param('uploadId') uploadId: string,
    @Body() body: { startTime: number; endTime: number }
  ) {
    const result = await this.uploadsService.processSegment(uploadId, body.startTime, body.endTime);
    return {
      data: result,
    };
  }

  @Get(':uploadId/deception-score')
  @ApiOperation({ summary: 'Get deception score for uploaded video' })
  @ApiResponse({ status: 200, description: 'Deception score retrieved' })
  async getDeceptionScore(@Param('uploadId') uploadId: string) {
    const score = await this.uploadsService.getDeceptionScore(uploadId);
    return {
      data: score,
    };
  }

  @Post(':uploadId/generate-consent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate consent form after video processing' })
  @ApiResponse({ status: 200, description: 'Consent form generated' })
  async generateConsent(@Param('uploadId') uploadId: string) {
    const result = await this.uploadsService.generateConsent(uploadId);
    return {
      data: result,
    };
  }

  @Get('claim/:claimId')
  @ApiOperation({ summary: 'Get all video uploads for a claim' })
  @ApiResponse({ status: 200, description: 'Uploads retrieved' })
  async getClaimUploads(@Param('claimId') claimId: string) {
    const uploads = await this.uploadsService.getClaimUploads(claimId);
    return {
      data: uploads,
    };
  }

  @Delete(':uploadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a video upload' })
  @ApiResponse({ status: 200, description: 'Upload deleted' })
  async deleteUpload(@Param('uploadId') uploadId: string) {
    const result = await this.uploadsService.deleteUpload(uploadId);
    return {
      data: result,
    };
  }
}
