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
  Res,
  StreamableFile,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { UploadsService } from './uploads.service';
import { extname } from 'path';
import * as fs from 'fs';
import * as path from 'path';
import { pipeline } from 'stream/promises';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { TenantIsolation, TenantScope, Tenant } from '../common/decorators/tenant.decorator';

// Ensure upload directory exists
const uploadDir = './uploads/videos';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

@ApiTags('video-uploads')
@ApiBearerAuth('access-token')
@Controller('uploads')
@UseGuards(InternalAuthGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('upload-assessment')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload a video for assessment' })
  @ApiResponse({ status: 201, description: 'Video uploaded successfully' })
  async uploadVideo(@Req() req: any, @Tenant() tenantContext: TenantContext) {
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

    const claimIdField = data.fields?.claimId;
    const claimId = claimIdField?.value || claimIdField || (req.query as any)?.claimId;

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
      filePath,
      tenantContext
    );

    return {
      id: upload.id,
      videoUrl: upload.videoUrl,
      recordingUrl: upload.videoUrl,
      duration: upload.duration || 0,
      status: upload.status,
      claimId: upload.claimId,
      createdAt: upload.createdAt,
    };
  }

  @Get(':uploadId')
  @ApiOperation({ summary: 'Get video upload details' })
  @ApiResponse({ status: 200, description: 'Upload details retrieved' })
  @ApiResponse({ status: 404, description: 'Upload not found' })
  async getUpload(@Param('uploadId') uploadId: string, @Tenant() tenantContext: TenantContext) {
    const upload = await this.uploadsService.getUpload(uploadId, tenantContext);
    return upload;
  }

  @Post(':uploadId/prepare')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Prepare video locally for processing' })
  @ApiResponse({ status: 200, description: 'Video prepared locally' })
  async prepareVideo(@Param('uploadId') uploadId: string, @Tenant() tenantContext: TenantContext) {
    return await this.uploadsService.prepareVideo(uploadId, false, tenantContext);
  }

  @Post(':uploadId/process-segment')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process a video segment' })
  @ApiResponse({ status: 200, description: 'Segment processed' })
  async processSegment(
    @Param('uploadId') uploadId: string,
    @Body() body: { startTime: number; endTime: number },
    @Tenant() tenantContext: TenantContext
  ) {
    const result = await this.uploadsService.processSegment(uploadId, body.startTime, body.endTime, tenantContext);
    return result;
  }

  @Post(':uploadId/generate-consent')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate consent form after video processing' })
  @ApiResponse({ status: 200, description: 'Consent form generated' })
  async generateConsent(@Param('uploadId') uploadId: string, @Tenant() tenantContext: TenantContext) {
    const result = await this.uploadsService.generateConsent(uploadId, tenantContext);
    return result;
  }

  @Get()
  @ApiOperation({ summary: 'Get all video uploads' })
  @ApiResponse({ status: 200, description: 'All uploads retrieved' })
  async getAllUploads(
    @Query('page') page: number = 1, 
    @Query('limit') limit: number = 10,
    @Tenant() tenantContext?: TenantContext
  ) {
    const result = await this.uploadsService.getAllUploads(page, limit, tenantContext);
    return {
      data: result.data,
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  @Get(':uploadId/segments')
  @ApiOperation({ summary: 'Get all analyzed segments for an upload' })
  @ApiResponse({ status: 200, description: 'Segments retrieved' })
  async getUploadSegments(@Param('uploadId') uploadId: string, @Tenant() tenantContext: TenantContext) {
    const segments = await this.uploadsService.getUploadSegments(uploadId, tenantContext);
    return segments;
  }

  @Get('claim/:claimId')
  @ApiOperation({ summary: 'Get all video uploads for a claim' })
  @ApiResponse({ status: 200, description: 'Uploads retrieved' })
  async getClaimUploads(@Param('claimId') claimId: string, @Tenant() tenantContext: TenantContext) {
    const uploads = await this.uploadsService.getClaimUploads(claimId, tenantContext);
    return uploads;
  }

  @Get(':uploadId/stream')
  @ApiOperation({ summary: 'Stream the locally prepared video' })
  async streamVideo(
    @Param('uploadId') uploadId: string,
    @Res({ passthrough: true }) res: any,
    @Req() req: any,
    @Tenant() tenantContext: TenantContext
  ) {
    // Basic access check
    await this.uploadsService.getUpload(uploadId, tenantContext);

    const { stream, size, total, isPartial, start, end } = await this.uploadsService.streamVideo(
      uploadId,
      req.headers.range
    );

    if (isPartial) {
      res.status(206);
      res.header('Content-Range', `bytes ${start}-${end}/${total}`);
    }

    res.header('Content-Type', 'video/mp4');
    res.header('Content-Length', size);
    res.header('Content-Disposition', `inline; filename="video-${uploadId}.mp4"`);
    res.header('Accept-Ranges', 'bytes');

    return new StreamableFile(stream);
  }

  @Delete(':uploadId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a video upload' })
  @ApiResponse({ status: 200, description: 'Upload deleted' })
  async deleteUpload(@Param('uploadId') uploadId: string, @Tenant() tenantContext: TenantContext) {
    const result = await this.uploadsService.deleteUpload(uploadId, tenantContext);
    return result;
  }
}
