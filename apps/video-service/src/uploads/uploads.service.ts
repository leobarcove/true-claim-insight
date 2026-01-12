import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaClient, AssessmentType, RiskScore } from '@prisma/client';
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

const execAsync = promisify(exec);
const prisma = new PrismaClient();

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

  constructor(private readonly configService: ConfigService) {
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
    uploadedBy?: string
  ) {
    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException('Claim not found');
    }

    // 1. Create the database record first to get an ID
    const upload = await prisma.videoUpload.create({
      data: {
        claimId,
        filename,
        fileSize,
        mimeType,
        videoUrl: 'PENDING', // Will update after upload
        uploadedBy,
        status: 'PENDING',
        duration: 0,
      },
    });

    const uploadId = upload.id;
    // The final local path used by review page
    const localReviewPath = path.join(tempDir, `full-${uploadId}.mp4`);
    let transcodedPath = '';

    try {
      // 2. Transcode to MP4 and save directly to the local review path
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
      await prisma.videoUpload.update({
        where: { id: uploadId },
        data: {
          videoUrl: publicUrl,
          duration,
        },
      });

      // 5. Cleanup the original (non-transcoded) temp file
      await fs.unlink(videoPath).catch(() => {});

      return this.getUpload(uploadId);
    } catch (error: any) {
      this.logger.error(`Failed to handle video upload ${uploadId}: ${error.message}`);
      // Mark as failed in DB
      await prisma.videoUpload
        .update({
          where: { id: uploadId },
          data: { status: 'FAILED' },
        })
        .catch(() => {});

      // Try to cleanup
      await fs.unlink(videoPath).catch(() => {});
      if (transcodedPath) await fs.unlink(transcodedPath).catch(() => {});

      throw new InternalServerErrorException(`Video upload failed: ${error.message}`);
    }
  }

  /**
   * Internal transcode helper that accepts an output path
   */
  private async transcodeToMp4Internal(inputPath: string, outputPath: string): Promise<string> {
    await execAsync(
      `"${ffmpegPath}" -y -i "${inputPath}" -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`
    );
    return outputPath;
  }

  /**
   * Get video upload details
   */
  async getUpload(uploadId: string) {
    const upload = await prisma.videoUpload.findUnique({
      where: { id: uploadId },
      include: {
        claim: {
          include: {
            claimant: true,
            adjuster: {
              include: {
                tenant: true,
                user: {
                  select: { fullName: true },
                },
              },
            },
          },
        },
      },
    });

    if (!upload) {
      throw new NotFoundException('Video upload not found');
    }

    // Capture raw URL for session matching before signing
    const rawVideoUrl = upload.videoUrl;

    // Sign the URL if it's a Supabase URL
    upload.videoUrl = await this.signUrlIfNeeded(upload.videoUrl);

    // Find the associated session for risk assessments
    // Prioritize matching by recordingUrl to ensure we get the session specifically for this upload
    let session = await prisma.session.findFirst({
      where: {
        claimId: upload.claimId,
        recordingUrl: rawVideoUrl,
      },
    });

    // Fallback to latest session (backward compatibility or pre-processing state)
    if (!session) {
      session = await prisma.session.findFirst({
        where: { claimId: upload.claimId },
        orderBy: { createdAt: 'desc' },
      });
    }

    return {
      ...upload,
      sessionId: session?.id,
    };
  }

  /**
   * Pre-download video from Supabase to local storage for faster segment processing
   */
  async prepareVideo(uploadId: string, shouldWait = false) {
    const localPath = path.join(tempDir, `full-${uploadId}.mp4`);

    // 1. If already exists, return instantly
    if (fs_sync.existsSync(localPath)) {
      this.logger.log(`Video ${uploadId} already exists locally at ${localPath}`);
      return { success: true, path: localPath, alreadyExists: true, status: 'completed' };
    }

    // 2. If already in progress, return instantly with 'processing'
    if (this.preparationPromises.has(uploadId)) {
      this.logger.log(`Preparation already in progress for ${uploadId}, returning status`);
      return { success: true, status: 'processing' };
    }

    // 3. Start preparation in the background to avoid Gateway timeouts (502)
    const preparePromise = (async () => {
      const partialPath = `${localPath}.downloading`;
      try {
        const upload = await this.getUpload(uploadId);
        this.logger.log(`Downloading video ${uploadId} from Supabase in background...`);

        const { apiUrl, key } = this.getSupabaseConfig();
        const bucketName = 'tci-uploads';

        // More robust storage path extraction
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
        const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minute timeout

        const response = await fetch(`${apiUrl}/storage/v1/object/${bucketName}/${storagePath}`, {
          headers: { Authorization: `Bearer ${key}` },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(
            `Failed to download video from Supabase: ${response.status} ${response.statusText}`
          );
        }

        if (!response.body) {
          throw new Error('Response body is empty');
        }

        // Stream to partial path first
        const fileStream = fs_sync.createWriteStream(partialPath);
        await pipeline(Readable.fromWeb(response.body as any), fileStream);

        // Rename to final path only when complete
        await fs.rename(partialPath, localPath);

        this.logger.log(`Successfully downloaded video to ${localPath} (Background)`);
        return { success: true, path: localPath };
      } catch (err: any) {
        this.logger.error(`Background preparation failed for ${uploadId}: ${err.message}`);
        // Cleanup partial file if it exists
        if (fs_sync.existsSync(partialPath)) {
          await fs.unlink(partialPath).catch(() => {});
        }
        throw err;
      } finally {
        // Clear the promise from the map when done
        this.preparationPromises.delete(uploadId);
      }
    })();

    // Store the promise so multiple calls can wait
    this.preparationPromises.set(uploadId, preparePromise);

    // If we were told to wait, await the full download
    if (shouldWait) {
      return await preparePromise;
    }

    return { success: true, status: 'started' };
  }

  async streamVideo(uploadId: string, range?: string) {
    const localPath = path.join(tempDir, `full-${uploadId}.mp4`);

    if (!fs_sync.existsSync(localPath)) {
      throw new NotFoundException(`Video not prepared locally. Call /prepare first.`);
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

  /**
   * Process a video segment and generate deception metrics
   */
  async processSegment(uploadId: string, startTime: number, endTime: number) {
    // Implement look-ahead strategy: Process the 5s window starting from the current startTime
    const segmentDuration = 5;
    const targetStart = startTime;
    const targetEnd = startTime + segmentDuration;
    const cacheKey = `${uploadId}-${targetStart}-${targetEnd}`;

    // Deduplication: If already processing this segment, return the existing promise
    if (this.segmentProcessingMap.has(cacheKey)) {
      this.logger.log(`Segment ${cacheKey} is already processing, attaching to existing job`);
      return this.segmentProcessingMap.get(cacheKey);
    }

    this.logger.log(`Processing segment ${targetStart}s to ${targetEnd}s for upload ${uploadId}`);

    const processPromise = (async () => {
      try {
        const localPath = path.join(tempDir, `full-${uploadId}.mp4`);
        let inputPath = localPath;

        if (!fs_sync.existsSync(localPath)) {
          this.logger.log(
            `Local file not found for ${uploadId}, using remote URL for segment extraction`
          );
          const upload = await this.getUpload(uploadId);
          inputPath = upload.videoUrl;
        }

        const metrics = await this.extractAndAnalyzeSegment(
          uploadId,
          inputPath,
          targetStart,
          targetEnd
        );

        return {
          uploadId,
          processedUntil: targetEnd,
          metrics,
        };
      } finally {
        this.segmentProcessingMap.delete(cacheKey);
      }
    })();

    this.segmentProcessingMap.set(cacheKey, processPromise);
    return processPromise;
  }

  /**
   * Process the entire video by downloading it locally and looping through 5s segments
   */
  async processVideo(uploadId: string) {
    const upload = await this.getUpload(uploadId);

    // Prevent multiple concurrent processing jobs
    if (upload.status === 'PROCESSING') {
      this.logger.log(`Video ${uploadId} is already being processed. Skipping redundant request.`);
      return { status: 'PROCESSING', alreadyInProgress: true };
    }

    // Ensure we have a local copy - Wait for it here since this is a full batch process
    const result = await this.prepareVideo(uploadId, true);
    const localInputPath = result.path || upload.videoUrl;

    await prisma.videoUpload.update({
      where: { id: uploadId },
      data: {
        status: 'PROCESSING',
      },
    });

    try {
      const duration = upload.duration || (await this.getVideoDuration(localInputPath));
      const segmentDuration = 5;
      const segments: { start: number; end: number }[] = [];
      for (let start = 0; start < duration; start += segmentDuration) {
        const end = Math.min(start + segmentDuration, duration);
        segments.push({ start, end });
      }

      this.logger.log(
        `Starting batch processing for ${uploadId}: ${segments.length} segments, duration ${duration}s`
      );

      // Processing with Sliding Window Concurrency (Pool Size = 5)
      const CONCURRENCY_LIMIT = 5;
      const executing = new Set<Promise<void>>();
      let lastProcessedTime = 0;

      for (const segment of segments) {
        const p = this.extractAndAnalyzeSegment(
          uploadId,
          localInputPath,
          segment.start,
          segment.end
        )
          .then(() => {
            if (segment.end > lastProcessedTime) lastProcessedTime = segment.end;
            return;
          })
          .catch((segmentError: any) => {
            this.logger.error(
              `Failed to process segment ${segment.start}-${segment.end}: ${segmentError.message}`
            );
          })
          .finally(() => {
            executing.delete(p);
          });

        executing.add(p);

        if (executing.size >= CONCURRENCY_LIMIT) {
          await Promise.race(executing);
        }

        // Periodically update DB progress (every ~5 segments or when pool drains)
        if (executing.size === 0 || segments.indexOf(segment) % 5 === 0) {
          await prisma.videoUpload.update({
            where: { id: uploadId },
            data: { processedUntil: lastProcessedTime },
          });
        }
      }

      await Promise.all(executing);
      await prisma.videoUpload.update({
        where: { id: uploadId },
        data: { processedUntil: lastProcessedTime },
      });

      // Generate consent form when processing is finished
      try {
        this.logger.log(`Processing complete for ${uploadId}. Generating assessment report...`);
        await this.generateConsent(uploadId);
      } catch (consentError: any) {
        this.logger.error(`Failed to auto-generate consent: ${consentError.message}`);
      }

      return {
        processedUntil: lastProcessedTime,
        status: 'COMPLETED',
      };
    } catch (error: any) {
      this.logger.error(`Failed to process video: ${error.message}`);
      throw new InternalServerErrorException(`Video processing failed: ${error.message}`);
    }
  }

  /**
   * High-level helper to extract a segment from a local file and analyze it
   */
  private async extractAndAnalyzeSegment(
    uploadId: string,
    localInputPath: string,
    start: number,
    end: number
  ) {
    const tempId = `${uploadId}-${start}-${end}-${Date.now()}`;
    const segmentVideoPath = path.join(tempDir, `seg-v-${tempId}.mp4`);
    const segmentAudioPath = path.join(tempDir, `seg-a-${tempId}.wav`);

    try {
      await execAsync(
        `"${ffmpegPath}" -y -ss ${start} -i "${localInputPath}" -t ${end - start} ` +
          `-map 0:v? -c:v libx264 -preset ultrafast -tune zerolatency -vf "scale=480:-2,fps=15" -crf 30 -movflags +faststart "${segmentVideoPath}" ` +
          `-map 0:a? -vn -acodec pcm_s16le -ar 44100 -ac 1 "${segmentAudioPath}"`
      );

      return await this.analyzeAndStoreSegment(
        uploadId,
        segmentVideoPath,
        segmentAudioPath,
        start,
        end
      );
    } finally {
      // Cleanup segment files
      await Promise.all([
        fs.unlink(segmentVideoPath).catch(() => {}),
        fs.unlink(segmentAudioPath).catch(() => {}),
      ]);
    }
  }

  /**
   * Internal helper to analyze a segment file and store results
   */
  private async analyzeAndStoreSegment(
    uploadId: string,
    segmentVideoPath: string,
    segmentAudioPath: string,
    startTime: number,
    endTime: number
  ) {
    try {
      const audioBuffer = await fs.readFile(segmentAudioPath);
      const videoBuffer = await fs.readFile(segmentVideoPath);
      const [audioResult, videoResult, expressionResult] = await Promise.all([
        this.callAnalyzer('/analyze-audio', audioBuffer, 'segment.wav'),
        this.callAnalyzer('/analyze-video', videoBuffer, 'segment.mp4'),
        this.callAnalyzer('/analyze-expression', videoBuffer, 'segment.mp4'),
      ]);

      // Debug logging
      this.logger.log(
        `[Segment Analysis] ${uploadId} - ${segmentVideoPath} (Duration: ${startTime}-${endTime})`
      );
      console.log('Voice Stress:', JSON.stringify(audioResult || {}, null, 2));
      console.log('Visual Behavior:', JSON.stringify(videoResult || {}, null, 2));
      console.log('Expression Measurement:', JSON.stringify(expressionResult || {}, null, 2));

      // Normalize metrics
      const wvs = this.normalizeVoiceStress(audioResult.metrics);
      const wvb = this.normalizeVisualBehavior(videoResult.metrics);
      const wem = this.calculateExpressionScore(expressionResult);
      this.logger.log(
        `[Segment Analysis] Scores - Voice: ${wvs.toFixed(3)}, Visual: ${wvb.toFixed(3)}, Expression: ${wem.toFixed(3)}`
      );

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

      this.storeSegmentAnalysis(uploadId, startTime, endTime, metrics);
      return metrics;
    } catch (error: any) {
      this.logger.error(`Analysis failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate consent form after video processing is complete
   */
  async generateConsent(uploadId: string) {
    const uploadResult = await this.getUpload(uploadId);
    const upload = uploadResult as any;
    const sessionId = upload.sessionId;

    // Fetch the latest deception score for this session
    const latestScore = await prisma.deceptionScore.findFirst({
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

    // Prepare payload for Python PDF generator
    const payload = {
      sessionId: sessionId || `upload-${upload.id}`,
      claimId: upload.claimId,
      claimant: {
        name: upload.claim.claimant?.fullName || 'N/A',
        nric: upload.claim.claimant?.nricHash || 'N/A',
        phone: upload.claim.claimant?.phoneNumber || 'N/A',
        email: upload.claim.claimant?.email || 'N/A',
      },
      claim: {
        claimNumber: upload.claim.claimNumber,
        policyNumber: upload.claim.policyNumber || 'N/A',
        incidentDate: upload.claim.incidentDate || new Date().toISOString(),
        vehiclePlate: upload.claim.vehiclePlateNumber || 'N/A',
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
        firmName: upload.claim.adjuster?.tenant?.name || 'True Claim Insight',
      },
    };

    const pdfResult = await fetch(`${this.analyzerUrl}/generate-consent-pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!pdfResult.ok) {
      throw new InternalServerErrorException('Failed to generate PDF consent form');
    }

    const result = (await pdfResult.json()) as {
      success: boolean;
      storage_path: string;
      bucket: string;
      signed_url: string;
      file_size: number;
    };
    const pdfPath = path.join(path.dirname(upload.videoUrl), `consent-${upload.id}.pdf`);

    await prisma.videoUpload.update({
      where: { id: uploadId },
      data: { status: 'COMPLETED' },
    });

    const document = await prisma.document.create({
      data: {
        claimId: upload.claimId,
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

    // Final cleanup: delete local video file after document is created
    const localVideoPath = path.join(tempDir, `full-${uploadId}.mp4`);
    if (fs_sync.existsSync(localVideoPath)) {
      this.logger.log(`Final cleanup for ${uploadId}: Removing local video file ${localVideoPath}`);
      await fs.unlink(localVideoPath).catch(() => {});
    }

    return { documentId: document.id, success: true };
  }

  async getClaimUploads(claimId: string) {
    const uploads = await prisma.videoUpload.findMany({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      uploads.map(async upload => ({
        ...upload,
        videoUrl: await this.signUrlIfNeeded(upload.videoUrl),
      }))
    );
  }

  async deleteUpload(uploadId: string) {
    const upload = await prisma.videoUpload.findUnique({
      where: { id: uploadId },
    });

    if (!upload) {
      throw new NotFoundException('Video upload not found');
    }

    // Check if videoUrl is a Supabase URL
    const { apiUrl, key } = this.getSupabaseConfig();
    const bucketName = 'tci-uploads';
    const publicPathPart = `/storage/v1/object/public/${bucketName}/`;

    if (upload.videoUrl.includes(publicPathPart)) {
      try {
        const storagePath = upload.videoUrl.split(publicPathPart).pop();
        if (storagePath) {
          const response = await fetch(`${apiUrl}/storage/v1/object/${bucketName}/${storagePath}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${key}`,
            },
          });

          if (!response.ok) {
            this.logger.warn(`Failed to delete Supabase file: ${response.statusText}`);
          }
        }
      } catch (error: any) {
        this.logger.error(`Error deleting from Supabase: ${error.message}`);
      }
    } else {
      // Local file
      try {
        await fs.unlink(upload.videoUrl);
      } catch (error: any) {
        this.logger.error(`Failed to delete video file: ${error.message}`);
      }
    }

    await prisma.videoUpload.delete({
      where: { id: uploadId },
    });

    return { success: true };
  }

  // ==================== Private Helpers ====================

  private async callAnalyzer(
    path: string,
    buffer: Buffer,
    filename: string,
    retries = 3
  ): Promise<any> {
    const formData = new FormData();
    const mimeType = filename.endsWith('.wav') ? 'audio/wav' : 'video/mp4';
    formData.append('file', new Blob([buffer], { type: mimeType }), filename);

    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(`${this.analyzerUrl}${path}`, {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          return await response.json();
        }

        const errorText = await response.text();
        lastError = new Error(`Analyzer error [${response.status}]: ${errorText}`);

        // Only retry on 5xx errors
        if (response.status < 500) {
          throw lastError;
        }

        this.logger.warn(`Analyzer attempt ${i + 1} failed, retrying... (${lastError.message})`);
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      } catch (error: any) {
        lastError = error;
        if (i === retries - 1) throw error;
        this.logger.warn(`Analyzer attempt ${i + 1} crashed, retrying... (${error.message})`);
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
      }
    }

    throw lastError || new Error('Analyzer failed after retries');
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

    // Support both { metrics: { ... } } and { ... } formats
    const metrics = input.metrics || input;

    // components: Blink Rate dev + Lip Compression + Blink Duration
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

    // Support nested { metrics: { ... } } or { top_emotions: ... } or direct array
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

    // Return the fraud score, slightly adjusted
    return Math.min(1, maxFraud > 0.1 ? maxFraud : 0);
  }

  private async getVideoDuration(videoPath: string): Promise<number> {
    const { stdout } = await execAsync(
      `"${ffprobeStatic.path}" -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    return parseFloat(stdout.trim());
  }

  private async storeSegmentAnalysis(uploadId: string, _start: number, _end: number, metrics: any) {
    // Fetch raw upload directly to ensure we have the correct videoUrl for matching
    const upload = await prisma.videoUpload.findUnique({
      where: { id: uploadId },
      include: { claim: true },
    });

    if (!upload) throw new NotFoundException('Video upload not found');

    // Find session specifically for this upload
    let session = await prisma.session.findFirst({
      where: {
        claimId: upload.claimId,
        recordingUrl: upload.videoUrl,
      },
    });

    if (!session) {
      session = await prisma.session.create({
        data: {
          claimId: upload.claimId,
          roomId: BigInt(Date.now()),
          status: 'COMPLETED',
          analysisStatus: 'PROCESSING',
          recordingUrl: upload.videoUrl, // Link session to this specific upload
        },
      });
    }

    const getRiskScore = (score: number): RiskScore =>
      score > 0.7 ? RiskScore.HIGH : score > 0.4 ? RiskScore.MEDIUM : RiskScore.LOW;

    await prisma.$transaction([
      prisma.deceptionScore.create({
        data: {
          sessionId: session.id,
          deceptionScore: metrics.deceptionScore,
          voiceStress: metrics.breakdown.voiceStress,
          visualBehavior: metrics.breakdown.visualBehavior,
          expressionMeasurement: metrics.breakdown.expressionMeasurement,
        },
      }),
      prisma.riskAssessment.create({
        data: {
          sessionId: session.id,
          assessmentType: AssessmentType.VOICE_ANALYSIS,
          provider: 'Parselmouth (Video Segment)',
          riskScore: getRiskScore(metrics.breakdown.voiceStress),
          confidence: metrics.details.voice?.confidence || 0.85,
          rawResponse: metrics.details.voice,
        },
      }),
      prisma.riskAssessment.create({
        data: {
          sessionId: session.id,
          assessmentType: AssessmentType.ATTENTION_TRACKING,
          provider: 'MediaPipe (Video Segment)',
          riskScore: getRiskScore(metrics.breakdown.visualBehavior),
          confidence: metrics.details.visual?.confidence || 0.8,
          rawResponse: metrics.details.visual,
        },
      }),
      prisma.riskAssessment.create({
        data: {
          sessionId: session.id,
          assessmentType: AssessmentType.VISUAL_MODERATION,
          provider: 'HumeAI (Video Segment)',
          riskScore: getRiskScore(metrics.breakdown.expressionMeasurement),
          confidence: metrics.details.expression?.confidence || 0.9,
          rawResponse: metrics.details.expression,
        },
      }),
    ]);

    // Mark down the duration location so system knows progress
    await prisma.videoUpload.update({
      where: { id: uploadId },
      data: {
        processedUntil: _end,
        status: 'PROCESSING',
      },
    });
  }

  // ==================== Supabase Helpers ====================

  private getSupabaseConfig() {
    const url = this.configService.get<string>('SUPABASE_URL');
    const key = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !key) {
      this.logger.error(
        'Supabase credentials (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY) are missing.'
      );
      throw new InternalServerErrorException('Supabase configuration error');
    }

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
          body: JSON.stringify({ expiresIn: 3600 }), // 1 hour
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
