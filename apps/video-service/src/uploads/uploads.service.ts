import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { AssessmentType, RiskScore, SessionStatus } from '@prisma/client';
import * as fs from 'fs/promises';
import * as fs_sync from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import ffmpegPath = require('ffmpeg-static');
import ffprobeStatic = require('ffprobe-static');

import { PrismaService } from '../config/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantContext } from '../common/guards/tenant.guard';

const execAsync = promisify(exec);

// Ensure upload and temp directories exist using absolute paths
const uploadDir = path.resolve(process.cwd(), 'uploads/videos');
const tempDir = path.resolve(process.cwd(), 'uploads/temp');

[uploadDir, tempDir].forEach(dir => {
  if (!fs_sync.existsSync(dir)) {
    fs_sync.mkdirSync(dir, { recursive: true });
  }
});

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly analyzerUrl: string;
  private preparationPromises = new Map<string, Promise<any>>();
  private segmentProcessingMap = new Map<string, Promise<any>>();
  private signedUrlCache = new Map<string, { url: string; expires: number }>();

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService
  ) {
    this.analyzerUrl = this.configService.get<string>('RISK_ANALYZER_URL', 'http://localhost:3005');
    this.logger.log(`Local Storage initialized: ${uploadDir}`);
    this.logger.log(`Temp Storage initialized: ${tempDir}`);
    this.logger.log(`FFmpeg Path: ${ffmpegPath}`);
    this.logger.log(`FFprobe Path: ${ffprobeStatic.path}`);
  }

  async createUpload(
    claimId: string,
    filename: string,
    fileSize: number,
    mimeType: string,
    videoPath: string,
    tenantContext: TenantContext
  ) {
    await this.tenantService.validateClaimAccess(claimId, tenantContext);

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    // 1. Create the database record
    const upload = await this.prisma.videoUpload.create({
      data: {
        claimId,
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId,
        filename,
        fileSize,
        mimeType,
        videoUrl: 'PENDING',
        uploadedBy: tenantContext.userId,
        status: 'PENDING',
        duration: 0,
      },
    });

    const uploadId = upload.id;
    const localReviewPath = path.join(tempDir, `full-${uploadId}.mp4`);
    let transcodedPath = '';

    try {
      this.logger.log(`Transcoding video ${uploadId} to MP4...`);
      transcodedPath = await this.transcodeToMp4Internal(videoPath, localReviewPath);
      this.logger.log(`Transcoding complete for ${uploadId}`);

      const duration = await this.getVideoDuration(transcodedPath);

      // 3. Upload to Supabase Storage
      const { apiUrl, key } = this.getSupabaseConfig();
      const bucketName = 'tci-uploads';
      const fileContent = await fs.readFile(transcodedPath);
      const storagePath = `${claimId}/video-${uploadId}.mp4`;

      const uploadResponse = await fetch(
        `${apiUrl}/storage/v1/object/${bucketName}/${storagePath}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'video/mp4',
            'x-upsert': 'true',
          },
          body: fileContent,
        }
      );

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Supabase upload failed: ${errorText}`);
      }

      const publicUrl = `${apiUrl}/storage/v1/object/public/${bucketName}/${storagePath}`;

      // 4. Update the record
      await this.prisma.videoUpload.update({
        where: { id: uploadId },
        data: {
          videoUrl: publicUrl,
          duration,
        },
      });

      // 5. Cleanup temp file
      await fs.unlink(videoPath).catch(() => {});

      return this.getUpload(uploadId, tenantContext);
    } catch (error: any) {
      this.logger.error(`Failed to handle video upload ${uploadId}: ${error.message}`);
      await this.prisma.videoUpload
        .update({
          where: { id: uploadId },
          data: { status: 'FAILED' },
        })
        .catch(() => {});

      await fs.unlink(videoPath).catch(() => {});
      if (transcodedPath) await fs.unlink(transcodedPath).catch(() => {});

      throw new InternalServerErrorException(`Video upload failed: ${error.message}`);
    }
  }

  private async transcodeToMp4Internal(inputPath: string, outputPath: string): Promise<string> {
    await execAsync(
      `"${ffmpegPath}" -y -i "${inputPath}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`
    );
    return outputPath;
  }

  async getUpload(uploadId: string, tenantContext: TenantContext) {
    const upload = await this.prisma.videoUpload.findUnique({
      where: { id: uploadId },
      include: {
        claim: {
          include: {
            claimant: true,
            adjuster: {
              include: {
                tenant: true,
                user: {
                  select: {
                    fullName: true,
                    email: true,
                    phoneNumber: true,
                  },
                },
              },
            },
            insurerTenant: true,
          },
        },
      },
    });

    if (!upload) {
      throw new NotFoundException('Video upload not found');
    }

    await this.tenantService.validateClaimAccess(upload.claimId, tenantContext);

    const rawVideoUrl = upload.videoUrl;
    upload.videoUrl = await this.signUrlIfNeeded(upload.videoUrl);

    let session = await this.prisma.session.findFirst({
      where: {
        claimId: upload.claimId,
        recordingUrl: rawVideoUrl,
      },
    });

    if (!session) {
      session = await this.prisma.session.findFirst({
        where: { claimId: upload.claimId },
        orderBy: { createdAt: 'desc' },
      });
    }

    return {
      ...upload,
      recordingUrl: upload.videoUrl,
      sessionId: session?.id,
    };
  }

  async prepareVideo(uploadId: string, shouldWait = false, tenantContext: TenantContext) {
    const localPath = path.join(tempDir, `full-${uploadId}.mp4`);

    if (fs_sync.existsSync(localPath)) {
      return { success: true, path: localPath, alreadyExists: true, status: 'completed' };
    }

    if (this.preparationPromises.has(uploadId)) {
      return { success: true, status: 'processing' };
    }

    const preparePromise = (async () => {
      const partialPath = `${localPath}.downloading`;
      try {
        const upload = await this.getUpload(uploadId, tenantContext);
        const { apiUrl, key } = this.getSupabaseConfig();
        const bucketName = 'tci-uploads';

        let storagePath = '';
        const bucketSearch = `/${bucketName}/`;
        const bucketIndex = upload.videoUrl.indexOf(bucketSearch);

        if (bucketIndex !== -1) {
          storagePath = upload.videoUrl.substring(bucketIndex + bucketSearch.length);
        } else {
          storagePath = upload.videoUrl.split(`${bucketName}/`).pop() || '';
        }

        storagePath = storagePath.split('?')[0];

        if (!storagePath) {
          throw new Error(`Could not determine storage path from URL: ${upload.videoUrl}`);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600000);

        const response = await fetch(`${apiUrl}/storage/v1/object/${bucketName}/${storagePath}`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Failed to download video: ${response.statusText}`);
        }

        if (!response.body) {
          throw new Error('Response body is empty');
        }

        const fileStream = fs_sync.createWriteStream(partialPath);
        await pipeline(Readable.fromWeb(response.body as any), fileStream);
        await fs.rename(partialPath, localPath);

        return { success: true, path: localPath };
      } catch (err: any) {
        if (fs_sync.existsSync(partialPath)) {
          await fs.unlink(partialPath).catch(() => {});
        }
        throw err;
      } finally {
        this.preparationPromises.delete(uploadId);
      }
    })();

    this.preparationPromises.set(uploadId, preparePromise);

    if (shouldWait) {
      return await preparePromise;
    }

    return { success: true, status: 'started' };
  }

  async streamVideo(uploadId: string, range?: string) {
    const localPath = path.join(tempDir, `full-${uploadId}.mp4`);

    if (!fs_sync.existsSync(localPath)) {
      throw new NotFoundException(`Video not prepared locally.`);
    }

    const { size } = fs_sync.statSync(localPath);

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : size - 1;

      if (start >= size || end >= size) {
        throw new Error('Requested range not satisfiable');
      }

      const chunksize = end - start + 1;
      const stream = fs_sync.createReadStream(localPath, { start, end });

      return {
        stream,
        size: chunksize,
        total: size,
        start,
        end,
        isPartial: true,
      };
    }

    const stream = fs_sync.createReadStream(localPath);

    return {
      stream,
      size,
      total: size,
      isPartial: false,
    };
  }

  async processSegment(
    uploadId: string,
    startTime: number,
    endTime: number,
    tenantContext: TenantContext
  ) {
    const defaultDuration = 5;
    const targetStart = startTime;
    const targetEnd = endTime && endTime > startTime ? endTime : startTime + defaultDuration;
    const cacheKey = `${uploadId}-${targetStart}-${targetEnd}`;

    if (this.segmentProcessingMap.has(cacheKey)) {
      return this.segmentProcessingMap.get(cacheKey);
    }

    const processPromise = (async () => {
      try {
        const localPath = path.join(tempDir, `full-${uploadId}.mp4`);
        let inputPath = localPath;

        if (!fs_sync.existsSync(localPath)) {
          const preparationPromise = this.preparationPromises.get(uploadId);
          if (preparationPromise) {
            await preparationPromise.catch(() => {});
          }

          if (fs_sync.existsSync(localPath)) {
            inputPath = localPath;
          } else {
            const upload = await this.getUpload(uploadId, tenantContext);
            inputPath = upload.videoUrl;
          }
        }
        const duration = await this.getVideoDuration(inputPath);
        const actualEnd = duration ? Math.min(targetEnd, duration) : targetEnd;

        if (duration && (targetStart >= duration || actualEnd - targetStart < 0.1)) {
          return { processedUntil: duration || actualEnd, metrics: null };
        }

        const metrics = await this.extractAndAnalyzeSegment(
          uploadId,
          inputPath,
          targetStart,
          actualEnd,
          tenantContext
        );

        return {
          uploadId,
          processedUntil: actualEnd,
          metrics,
        };
      } finally {
        this.segmentProcessingMap.delete(cacheKey);
      }
    })();

    this.segmentProcessingMap.set(cacheKey, processPromise);
    return processPromise;
  }

  async processVideo(uploadId: string, tenantContext: TenantContext) {
    const upload = await this.getUpload(uploadId, tenantContext);

    if (upload.status === 'PROCESSING') {
      return { status: 'PROCESSING', alreadyInProgress: true };
    }

    const result = await this.prepareVideo(uploadId, true, tenantContext);
    const localInputPath = result.path || upload.videoUrl;

    await this.prisma.videoUpload.update({
      where: { id: uploadId },
      data: { status: 'PROCESSING' },
    });

    try {
      const duration = upload.duration || (await this.getVideoDuration(localInputPath));
      const segmentDuration = 5;
      const segments: { start: number; end: number }[] = [];
      for (let start = 0; start < duration; start += segmentDuration) {
        const end = Math.min(start + segmentDuration, duration);
        segments.push({ start, end });
      }

      const CONCURRENCY_LIMIT = 5;
      const executing = new Set<Promise<void>>();
      let lastProcessedTime = 0;

      for (const segment of segments) {
        const p = this.extractAndAnalyzeSegment(
          uploadId,
          localInputPath,
          segment.start,
          segment.end,
          tenantContext
        )
          .then(() => {
            if (segment.end > lastProcessedTime) lastProcessedTime = segment.end;
          })
          .catch(err => {
            this.logger.error(`Segment failed: ${err.message}`);
          })
          .finally(() => {
            executing.delete(p);
          });

        executing.add(p);
        if (executing.size >= CONCURRENCY_LIMIT) {
          await Promise.race(executing);
        }

        if (executing.size === 0 || segments.indexOf(segment) % 5 === 0) {
          await this.prisma.videoUpload.update({
            where: { id: uploadId },
            data: { processedUntil: lastProcessedTime },
          });
        }
      }

      await Promise.all(executing);
      await this.prisma.videoUpload.update({
        where: { id: uploadId },
        data: { processedUntil: lastProcessedTime },
      });

      try {
        await this.generateConsent(uploadId, tenantContext);
      } catch (e: any) {
        this.logger.error(`Failed to generate consent: ${e.message}`);
      }

      return { processedUntil: lastProcessedTime, status: 'COMPLETED' };
    } catch (error: any) {
      throw new InternalServerErrorException(`Processing failed: ${error.message}`);
    }
  }

  private async extractAndAnalyzeSegment(
    uploadId: string,
    localInputPath: string,
    start: number,
    end: number,
    tenantContext: TenantContext
  ) {
    const tempId = `${uploadId}-${start}-${end}-${Date.now()}`;
    const segmentVideoPath = path.join(tempDir, `seg-v-${tempId}.mp4`);
    const segmentAudioPath = path.join(tempDir, `seg-a-${tempId}.wav`);

    try {
      const hasAudio = await this.hasAudioStream(localInputPath);
      const isUrl = localInputPath.startsWith('http');

      const roundedStart = Math.max(0, Number(start.toFixed(2)));
      const roundedEnd = Number(end.toFixed(2));
      const segmentDuration = Number((roundedEnd - roundedStart).toFixed(2));

      if (segmentDuration < 0.1) return null;

      const inputOptions = isUrl
        ? '-reconnect 1 -reconnect_at_eof 1 -reconnect_delay_max 2 -timeout 10000000'
        : '';
      const commonOutput = `-t ${segmentDuration} -c:v libx264 -preset ultrafast -vf "scale=480:-2,fps=15" -crf 28 -movflags +faststart`;

      if (isUrl) {
        await execAsync(
          `"${ffmpegPath}" -y ${inputOptions} -ss ${roundedStart} -i "${localInputPath}" ${commonOutput} -map 0:v:0? -an "${segmentVideoPath}"`
        );
        if (hasAudio) {
          await execAsync(
            `"${ffmpegPath}" -y ${inputOptions} -ss ${roundedStart} -i "${localInputPath}" -t ${segmentDuration} -map 0:a:0? -vn -acodec pcm_s16le -ar 44100 -ac 1 "${segmentAudioPath}"`
          );
        }
      } else {
        if (hasAudio) {
          await execAsync(
            `"${ffmpegPath}" -y -ss ${start} -i "${localInputPath}" -t ${end - start} ` +
              `-map 0:v:0? -c:v libx264 -preset ultrafast -vf "scale=480:-2,fps=15" -crf 28 -movflags +faststart "${segmentVideoPath}" ` +
              `-map 0:a:0? -vn -acodec pcm_s16le -ar 44100 -ac 1 "${segmentAudioPath}"`
          );
        } else {
          await execAsync(
            `"${ffmpegPath}" -y -ss ${start} -i "${localInputPath}" -t ${end - start} ` +
              `-map 0:v:0? -c:v libx264 -preset ultrafast -vf "scale=480:-2,fps=15" -crf 28 -movflags +faststart "${segmentVideoPath}"`
          );
        }
      }

      try {
        await fs.access(segmentVideoPath);
      } catch (e) {
        throw new Error(
          `FFmpeg finished but video segment file was not created: ${segmentVideoPath}`
        );
      }

      if (hasAudio) {
        try {
          await fs.access(segmentAudioPath);
        } catch (e) {
          this.logger.warn(`Audio segment missing despite hasAudio=true: ${segmentAudioPath}`);
        }
      }

      return await this.analyzeAndStoreSegment(
        uploadId,
        segmentVideoPath,
        segmentAudioPath,
        start,
        end,
        !hasAudio,
        tenantContext
      );
    } finally {
      await fs.unlink(segmentVideoPath).catch(() => {});
      await fs.unlink(segmentAudioPath).catch(() => {});
    }
  }

  private async analyzeAndStoreSegment(
    uploadId: string,
    segmentVideoPath: string,
    segmentAudioPath: string,
    startTime: number,
    endTime: number,
    noAudio: boolean,
    tenantContext: TenantContext
  ) {
    const audioBuffer = !noAudio ? await fs.readFile(segmentAudioPath) : Buffer.alloc(0);
    const videoBuffer = await fs.readFile(segmentVideoPath);

    const [audioResult, videoResult, expressionResult] = await Promise.all([
      !noAudio
        ? this.callAnalyzer('/analyze-audio', audioBuffer, 'segment.wav')
        : Promise.resolve({ metrics: null }),
      this.callAnalyzer('/analyze-video', videoBuffer, 'segment.mp4'),
      this.callAnalyzer(`/analyze-expression?noAudio=${noAudio}`, videoBuffer, 'segment.mp4'),
    ]);

    const wvs = this.normalizeVoiceStress(audioResult.metrics);
    const wvb = this.normalizeVisualBehavior(videoResult.metrics);
    const wem = this.calculateExpressionScore(expressionResult);
    const w = 0.33; // Equal weights
    const deceptionScore = w * wvs + w * wvb + w * wem;

    const metrics = {
      deceptionScore: parseFloat(deceptionScore.toFixed(4)),
      breakdown: {
        voiceStress: parseFloat(wvs.toFixed(4)),
        visualBehavior: parseFloat(wvb.toFixed(4)),
        expressionMeasurement: parseFloat(wem.toFixed(4)),
      },
      details: {
        voice: { ...audioResult, ...audioResult.metrics },
        visual: { ...videoResult, ...videoResult.metrics },
        expression: { ...expressionResult, ...expressionResult.metrics },
      },
    };

    await this.storeSegmentAnalysis(uploadId, startTime, endTime, metrics, tenantContext);
    return metrics;
  }

  async generateConsent(uploadId: string, tenantContext: TenantContext) {
    const upload = await this.getUpload(uploadId, tenantContext);
    const sessionId = upload.sessionId;

    const latestScore = await this.prisma.deceptionScore.findFirst({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    const scores = {
      deceptionScore: latestScore ? Number(latestScore.deceptionScore) : 0,
      breakdown: {
        voiceStress: latestScore ? Number(latestScore.voiceStress) : 0,
        visualBehavior: latestScore ? Number(latestScore.visualBehavior) : 0,
        expressionMeasurement: latestScore ? Number(latestScore.expressionMeasurement) : 0,
      },
    };
    const payload = {
      sessionId: sessionId || `upload-${upload.id}`,
      claimId: upload.claimId,
      claimant: {
        name: upload.claim.claimant?.fullName || 'N/A',
        nric:
          upload.claim.claimant?.nric ||
          upload.claim.nric ||
          upload.claim.claimant?.nricHash ||
          'N/A',
        phone: upload.claim.claimant?.phoneNumber || 'N/A',
        email: upload.claim.claimant?.email || 'N/A',
      },
      claim: {
        claimNumber: upload.claim.claimNumber,
        policyNumber: upload.claim.policyNumber || 'N/A',
        incidentDate: upload.claim.incidentDate || new Date().toISOString(),
        vehiclePlate: upload.claim.vehiclePlateNumber || 'N/A',
        vehicleYear: upload.claim.vehicleYear?.toString() || 'N/A',
        vehicleMake: upload.claim.vehicleMake || 'N/A',
        vehicleModel: upload.claim.vehicleModel || 'N/A',
        engineNumber: upload.claim.vehicleEngineNumber || 'N/A',
        chassisNumber: upload.claim.vehicleChassisNumber || 'N/A',
        location: (upload.claim.incidentLocation as any)?.address || 'N/A',
      },
      analysis: {
        riskScore:
          scores.deceptionScore > 0.7 ? 'HIGH' : scores.deceptionScore > 0.4 ? 'MEDIUM' : 'LOW',
        deceptionScore: scores.deceptionScore,
        breakdown: scores.breakdown,
      },
      adjuster: {
        name: upload.claim.adjuster?.user?.fullName || 'System',
        firmName:
          upload.claim.adjuster?.tenant?.name ||
          upload.claim.insurerTenant?.name ||
          'True Claim Insight',
        firmAddress:
          (upload.claim.adjuster?.tenant?.settings as any)?.address ||
          (upload.claim.insurerTenant?.settings as any)?.address ||
          'No. 202 Jalan Raja Laut\nKuala Lumpur City Centre 50450\nKuala Lumpur, Malaysia',
        firmPhone:
          (upload.claim.adjuster?.tenant?.settings as any)?.phone ||
          (upload.claim.insurerTenant?.settings as any)?.phone ||
          upload.claim.adjuster?.user?.phoneNumber ||
          '+60 3-2789 4567',
        firmLogo:
          (upload.claim.adjuster?.tenant?.settings as any)?.logoUrl ||
          (upload.claim.insurerTenant?.settings as any)?.logoUrl ||
          'N/A',
      },
    };

    const pdfResult = await fetch(`${this.analyzerUrl}/generate-consent-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!pdfResult.ok) throw new Error('PDF generation failed');

    const result = (await pdfResult.json()) as any;
    const pdfPath = path.join(path.dirname(upload.videoUrl), `consent-${upload.id}.pdf`);
    const document = await this.prisma.document.create({
      data: {
        claimId: upload.claimId,
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId,
        type: 'SIGNED_STATEMENT',
        filename: `assessment-consent-${upload.id}.pdf`,
        storageUrl: result.signed_url || pdfPath,
        fileSize: result.file_size || 0,
        mimeType: 'application/pdf',
        metadata: {
          generatedFrom: 'video-upload',
          uploadId: upload.id,
          deceptionScore: scores.deceptionScore,
        },
      },
    });

    await this.prisma.videoUpload.update({
      where: { id: uploadId },
      data: { status: 'COMPLETED' },
    });

    // Final cleanup: delete local video file after document is created
    const localVideoPath = path.join(tempDir, `full-${uploadId}.mp4`);
    if (fs_sync.existsSync(localVideoPath)) {
      this.logger.log(`Final cleanup for ${uploadId}: Removing local video file ${localVideoPath}`);
      await fs.unlink(localVideoPath).catch(() => {});
    }

    return { documentId: document.id, success: true };
  }

  async getClaimUploads(claimId: string, tenantContext: TenantContext) {
    await this.tenantService.validateClaimAccess(claimId, tenantContext);
    const uploads = await this.prisma.videoUpload.findMany({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(
      uploads.map(async u => ({ ...u, videoUrl: await this.signUrlIfNeeded(u.videoUrl) }))
    );
  }

  async getAllUploads(page = 1, limit = 10, tenantContext?: TenantContext) {
    const skip = (page - 1) * limit;
    const where = this.tenantService.buildTenantFilter(tenantContext || null);

    const [uploads, total] = await Promise.all([
      this.prisma.videoUpload.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          claim: {
            select: {
              id: true,
              claimNumber: true,
              claimant: {
                select: {
                  fullName: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.videoUpload.count({ where }),
    ]);

    const data = await Promise.all(
      uploads.map(async u => ({ ...u, videoUrl: await this.signUrlIfNeeded(u.videoUrl) }))
    );

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getUploadSegments(uploadId: string, tenantContext: TenantContext) {
    const upload = await this.getUpload(uploadId, tenantContext);
    const session = await this.prisma.session.findFirst({
      where: { claimId: upload.claimId },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) return [];

    const scores = await this.prisma.deceptionScore.findMany({
      where: { sessionId: session.id },
      orderBy: { createdAt: 'asc' },
    });

    return scores.map((score, index) => ({
      id: score.id,
      uploadId: uploadId,
      startTime: index * 5,
      endTime: (index + 1) * 5,
      deceptionScore: score.deceptionScore,
      voiceStress: score.voiceStress,
      visualBehavior: score.visualBehavior,
      expressionMeasurement: score.expressionMeasurement,
      createdAt: score.createdAt,
    }));
  }

  async deleteUpload(uploadId: string, tenantContext: TenantContext) {
    const upload = await this.getUpload(uploadId, tenantContext);

    // Cleanup
    const { apiUrl, key } = this.getSupabaseConfig();
    const bucketName = 'tci-uploads';
    const publicPathPart = `/storage/v1/object/public/${bucketName}/`;

    if (upload.videoUrl.includes(publicPathPart)) {
      const storagePath = upload.videoUrl.split(publicPathPart).pop();
      if (storagePath) {
        await fetch(`${apiUrl}/storage/v1/object/${bucketName}/${storagePath}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${key}` },
        });
      }
    } else {
      // Local file
      try {
        await fs.unlink(upload.videoUrl);
      } catch (error: any) {
        this.logger.error(`Failed to delete video file: ${error.message}`);
      }
    }

    await this.prisma.videoUpload.delete({ where: { id: uploadId } });
    return { success: true };
  }

  private async callAnalyzer(path: string, buffer: Buffer, filename: string): Promise<any> {
    const formData = new FormData();
    const mimeType = filename.endsWith('.wav') ? 'audio/wav' : 'video/mp4';
    formData.append('file', new Blob([buffer], { type: mimeType }), filename);

    const response = await fetch(`${this.analyzerUrl}${path}`, { method: 'POST', body: formData });
    if (!response.ok) throw new Error(`Analyzer failed: ${response.statusText}`);
    return response.json();
  }

  private normalizeVoiceStress(metrics: any): number {
    if (!metrics) return 0;

    // Jitter: 0.5-6.0% normal, >6.0% stressed
    // Shimmer: 1.5-12.0% normal, >12.0% stressed
    // Pitch SD: 10-120 Hz normal, >120 Hz stressed
    // HNR: >12 dB good, <8 dB poor (inverse: lower HNR = higher stress)

    const jitterNorm = Math.min(1, Math.max(0, (metrics.jitter_percent - 0.8) / 7.0));
    const shimmerNorm = Math.min(1, Math.max(0, (metrics.shimmer_percent - 2.0) / 15.0));
    const pitchSdNorm = Math.min(1, Math.max(0, (metrics.pitch_sd_hz - 15) / 150));
    const hnrNorm = Math.min(1, Math.max(0, (15 - metrics.hnr_db) / 20));

    const weights = { jitter: 0.25, shimmer: 0.25, pitchSd: 0.2, hnr: 0.1 };
    const rawScore =
      jitterNorm * weights.jitter +
      shimmerNorm * weights.shimmer +
      pitchSdNorm * weights.pitchSd +
      hnrNorm * weights.hnr;

    // Use a power curve (square) to make it less sensitive to noise
    return Math.pow(rawScore, 2);
  }

  private normalizeVisualBehavior(input: any): number {
    if (!input) return 0;

    const metrics = input.metrics || input;
    const blinkRate = metrics.blink_rate_per_min || metrics.blink_rate || 18;
    const blinkDev = Math.min(0.4, Math.abs(blinkRate - 18) / 20);

    const lipRatio = metrics.avg_lip_tension || metrics.lip_tension || 0.45;
    const lipCompressionRisk = Math.min(0.4, Math.max(0, 0.4 - lipRatio) * 1.5);

    const blinkDur = metrics.avg_blink_duration_ms || metrics.blink_duration || 150;
    const blinkDurRisk = Math.min(0.2, Math.abs(blinkDur - 150) / 500);

    return Math.min(1, Math.max(0, blinkDev + lipCompressionRisk + blinkDurRisk));
  }

  private calculateExpressionScore(input: any): number {
    if (!input) return 0;
    const data = input.metrics || input;
    let emotionsArray = data;

    if (data.top_emotions && Array.isArray(data.top_emotions)) {
      emotionsArray = data.top_emotions;
    } else if (data.emotions && Array.isArray(data.emotions)) {
      emotionsArray = data.emotions;
    }

    const fraudEmotions = [
      'Guilt',
      'Shame',
      'Anxiety',
      'Doubt',
      'Fear',
      'Embarrassment',
      'Distress',
      'Disgust',
    ];
    let maxFraud = 0;

    if (Array.isArray(emotionsArray)) {
      emotionsArray.forEach((m: any) => {
        const name = m.name || m.label || m.emotion;
        if (name && fraudEmotions.includes(name)) {
          maxFraud = Math.max(maxFraud, m.score || m.probability || 0);
        }
      });
    } else if (typeof emotionsArray === 'object') {
      for (const [key, value] of Object.entries(emotionsArray)) {
        if (fraudEmotions.includes(key)) {
          maxFraud = Math.max(maxFraud, Number(value) || 0);
        }
      }
    }

    return Math.min(1, maxFraud > 0.1 ? maxFraud : 0);
  }

  private async getVideoDuration(videoPath: string): Promise<number> {
    const { stdout } = await execAsync(
      `"${ffprobeStatic.path}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    return parseFloat(stdout.trim());
  }

  private async hasAudioStream(videoPath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `"${ffprobeStatic.path}" -v error -select_streams a -show_entries stream=index -of csv=p=0 "${videoPath}"`
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  private async storeSegmentAnalysis(
    uploadId: string,
    _start: number,
    _end: number,
    metrics: any,
    tenantContext: TenantContext
  ) {
    const upload = await this.prisma.videoUpload.findUnique({
      where: { id: uploadId },
      include: { claim: true },
    });

    if (!upload) throw new NotFoundException('Upload not found');

    let session = await this.prisma.session.findFirst({
      where: {
        claimId: upload.claimId,
        recordingUrl: upload.videoUrl,
      },
    });

    if (!session) {
      session = await this.prisma.session.create({
        data: {
          claimId: upload.claimId,
          tenantId: tenantContext.tenantId,
          userId: tenantContext.userId,
          roomId: BigInt(Date.now()),
          status: SessionStatus.COMPLETED,
          analysisStatus: 'PROCESSING',
          recordingUrl: upload.videoUrl,
        },
      });
    }

    const getRiskScore = (score: number): RiskScore =>
      score > 0.7 ? RiskScore.HIGH : score > 0.4 ? RiskScore.MEDIUM : RiskScore.LOW;

    await this.prisma.$transaction([
      this.prisma.deceptionScore.create({
        data: {
          sessionId: session.id,
          tenantId: tenantContext.tenantId,
          userId: tenantContext.userId,
          deceptionScore: metrics.deceptionScore,
          voiceStress: metrics.breakdown.voiceStress,
          visualBehavior: metrics.breakdown.visualBehavior,
          expressionMeasurement: metrics.breakdown.expressionMeasurement,
        },
      }),
      this.prisma.riskAssessment.create({
        data: {
          sessionId: session.id,
          tenantId: tenantContext.tenantId,
          assessmentType: AssessmentType.VOICE_ANALYSIS,
          provider: 'Parselmouth',
          riskScore: getRiskScore(metrics.breakdown.voiceStress),
          confidence: metrics.details.voice?.confidence || 0.85,
          rawResponse: {
            ...metrics.details.voice,
            startTime: _start,
            endTime: _end,
            segmentDeception: metrics.deceptionScore,
            segmentBreakdown: metrics.breakdown,
          },
        },
      }),
      this.prisma.riskAssessment.create({
        data: {
          sessionId: session.id,
          tenantId: tenantContext.tenantId,
          assessmentType: AssessmentType.ATTENTION_TRACKING,
          provider: 'MediaPipe',
          riskScore: getRiskScore(metrics.breakdown.visualBehavior),
          confidence: metrics.details.visual?.confidence || 0.8,
          rawResponse: {
            ...metrics.details.visual,
            startTime: _start,
            endTime: _end,
            segmentDeception: metrics.deceptionScore,
            segmentBreakdown: metrics.breakdown,
          },
        },
      }),
      this.prisma.riskAssessment.create({
        data: {
          sessionId: session.id,
          tenantId: tenantContext.tenantId,
          assessmentType: AssessmentType.VISUAL_MODERATION,
          provider: 'HumeAI',
          riskScore: getRiskScore(metrics.breakdown.expressionMeasurement),
          confidence: metrics.details.expression?.confidence || 0.9,
          rawResponse: {
            ...metrics.details.expression,
            startTime: _start,
            endTime: _end,
            segmentDeception: metrics.deceptionScore,
            segmentBreakdown: metrics.breakdown,
          },
        },
      }),
    ]);

    await this.prisma.videoUpload.update({
      where: { id: uploadId },
      data: { processedUntil: _end, status: 'PROCESSING' },
    });
  }

  private getSupabaseConfig() {
    const url = this.configService.get<string>('SUPABASE_URL');
    const key = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');
    if (!url || !key) throw new Error('Supabase config missing');

    // Normalize URL: ensure it's the API gateway, not the storage-specific domain
    let apiUrl = url.replace(/\/$/, '');
    if (apiUrl.includes('storage.supabase.co')) {
      try {
        const urlObj = new URL(apiUrl);
        const projectRef = urlObj.hostname.split('.')[0];
        apiUrl = `https://${projectRef}.supabase.co`;
        this.logger.log(`Normalized Supabase URL from storage domain to API: ${apiUrl}`);
      } catch (e: any) {
        this.logger.warn(`Failed to parse SUPABASE_URL: ${e.message}`);
      }
    }

    return { apiUrl, key };
  }

  private async signUrlIfNeeded(videoUrl: string): Promise<string> {
    const bucketName = 'tci-uploads';
    const publicPathPart = `/storage/v1/object/public/${bucketName}/`;

    if (!videoUrl || !videoUrl.includes(publicPathPart)) {
      return videoUrl;
    }

    // Check cache first (valid for 50 mins)
    const cached = this.signedUrlCache.get(videoUrl);
    if (cached && cached.expires > Date.now()) {
      return cached.url;
    }

    try {
      const { apiUrl, key } = this.getSupabaseConfig();
      const storagePath = videoUrl.split(publicPathPart).pop();

      if (!storagePath) return videoUrl;

      const signResponse = await fetch(
        `${apiUrl}/storage/v1/object/sign/${bucketName}/${storagePath}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ expiresIn: 31536000 }), // 1 year
        }
      );

      if (signResponse.ok) {
        const data = (await signResponse.json()) as any;
        const signedUrl = data.signedUrl || data.signedURL;

        if (signedUrl) {
          let fullUrl = signedUrl;
          if (!signedUrl.startsWith('http')) {
            const baseUrl = apiUrl.replace(/\/$/, '');
            let pathPart = signedUrl.startsWith('/') ? signedUrl : `/${signedUrl}`;
            if (pathPart.includes('/object/') && !pathPart.startsWith('/storage/v1/')) {
              pathPart = `/storage/v1${pathPart}`;
            }
            fullUrl = `${baseUrl}${pathPart}`;
          }

          // Cache it
          this.signedUrlCache.set(videoUrl, {
            url: fullUrl,
            expires: Date.now() + 3000000, // 50 mins
          });
          return fullUrl;
        }
      }
    } catch (error: any) {
      this.logger.warn(`Error signing Supabase URL: ${error.message}`);
    }

    return videoUrl;
  }
}
