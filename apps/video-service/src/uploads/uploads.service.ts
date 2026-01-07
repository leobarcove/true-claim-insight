import {
  Injectable,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ConfigService } from '@nestjs/config';

const execAsync = promisify(exec);
const prisma = new PrismaClient();

@Injectable()
export class UploadsService {
  private readonly logger = new Logger(UploadsService.name);
  private readonly analyzerUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.analyzerUrl = this.configService.get<string>('RISK_ANALYZER_URL', 'http://localhost:3005');
  }

  /**
   * Create a new video upload record
   */
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

    let duration: number | null = null;
    try {
      duration = await this.getVideoDuration(videoPath);
    } catch (error: any) {
      this.logger.warn(`Failed to extract video duration: ${error.message}`);
    }

    const upload = await prisma.videoUpload.create({
      data: {
        claimId,
        filename,
        fileSize,
        mimeType,
        videoUrl: videoPath,
        uploadedBy,
        status: 'PENDING',
        duration,
      },
    });

    return upload;
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

    return upload;
  }

  /**
   * Process a video segment and generate deception metrics
   */
  async processSegment(uploadId: string, startTime: number, endTime: number) {
    const upload = await this.getUpload(uploadId);

    await prisma.videoUpload.update({
      where: { id: uploadId },
      data: {
        processedUntil: endTime,
        status: 'PROCESSING',
      },
    });

    const segmentPath = await this.extractVideoSegment(
      upload.videoUrl,
      startTime,
      endTime,
      uploadId
    );

    try {
      // 1. Analyze Audio
      const audioPath = segmentPath.replace('.mp4', '.wav');
      await execAsync(
        `ffmpeg -y -i "${segmentPath}" -vn -acodec pcm_s16le -ar 44100 -ac 1 "${audioPath}"`
      );

      const audioBuffer = await fs.readFile(audioPath);
      const audioResult = await this.callAnalyzer('/analyze-audio', audioBuffer, 'segment.wav');

      // 2. Analyze Video Behavior
      const videoResult = await this.callAnalyzer(
        '/analyze-video',
        await fs.readFile(segmentPath),
        'segment.mp4'
      );

      // 3. Analyze Expression
      const expressionResult = await this.callAnalyzer(
        '/analyze-expression',
        await fs.readFile(segmentPath),
        'segment.mp4'
      );

      const metrics = {
        deceptionScore:
          (this.mapRisk(audioResult.risk_score) +
            this.mapRisk(videoResult.risk_score) +
            this.mapRisk(expressionResult.risk_score)) /
          3,
        breakdown: {
          voiceStress: this.mapRisk(audioResult.risk_score),
          visualBehavior: this.mapRisk(videoResult.risk_score),
          expressionMeasurement: this.mapRisk(expressionResult.risk_score),
        },
      };

      await this.storeSegmentAnalysis(uploadId, startTime, endTime, metrics);

      // Cleanup
      await fs.unlink(segmentPath).catch(() => {});
      await fs.unlink(audioPath).catch(() => {});

      return {
        processedUntil: endTime,
        metrics,
      };
    } catch (error: any) {
      this.logger.error(`Failed to process video segment: ${error.message}`);
      await fs.unlink(segmentPath).catch(() => {});
      throw new InternalServerErrorException('Failed to process video segment');
    }
  }

  /**
   * Get aggregated deception score for the entire upload
   */
  async getDeceptionScore(uploadId: string) {
    const upload = await this.getUpload(uploadId);

    const scores = await prisma.$queryRaw<any[]>`
      SELECT 
        AVG(CAST("deceptionScore" AS DECIMAL)) as avg_deception,
        AVG(CAST("voiceStress" AS DECIMAL)) as avg_voice,
        AVG(CAST("visualBehavior" AS DECIMAL)) as avg_visual,
        AVG(CAST("expressionMeasurement" AS DECIMAL)) as avg_expression
      FROM deception_scores
      WHERE "sessionId" IN (
        SELECT id FROM sessions WHERE "claimId" = ${upload.claimId}
      )
    `;

    if (scores.length === 0 || !scores[0].avg_deception) {
      return {
        deceptionScore: 0,
        breakdown: { voiceStress: 0, visualBehavior: 0, expressionMeasurement: 0 },
      };
    }

    const score = scores[0];
    return {
      deceptionScore: parseFloat(score.avg_deception) || 0,
      breakdown: {
        voiceStress: parseFloat(score.avg_voice) || 0,
        visualBehavior: parseFloat(score.avg_visual) || 0,
        expressionMeasurement: parseFloat(score.avg_expression) || 0,
      },
    };
  }

  /**
   * Generate consent form after video processing is complete
   */
  async generateConsent(uploadId: string) {
    const upload = await this.getUpload(uploadId);
    const scores = await this.getDeceptionScore(uploadId);

    // Prepare payload for Python PDF generator
    const payload = {
      sessionId: `upload-${upload.id}`,
      claimId: upload.claimId,
      claimant: {
        name: (upload.claim as any).claimant?.fullName || 'N/A',
        nric: (upload.claim as any).claimant?.nricHash || 'N/A',
        phone: (upload.claim as any).claimant?.phoneNumber || 'N/A',
        email: (upload.claim as any).claimant?.email || 'N/A',
      },
      claim: {
        claimNumber: upload.claim.claimNumber,
        policyNumber: (upload.claim as any).policyNumber || 'N/A',
        incidentDate: (upload.claim as any).incidentDate || new Date().toISOString(),
        vehiclePlate: (upload.claim as any).vehiclePlateNumber || 'N/A',
        location: ((upload.claim as any).incidentLocation as any)?.address || 'N/A',
      },
      analysis: {
        riskScore:
          scores.deceptionScore > 0.7 ? 'HIGH' : scores.deceptionScore > 0.4 ? 'MEDIUM' : 'LOW',
        deceptionScore: scores.deceptionScore,
        breakdown: scores.breakdown,
      },
      adjuster: {
        name: (upload.claim as any).adjuster?.user?.fullName || 'System',
        firmName: (upload.claim as any).adjuster?.tenant?.name || 'True Claim Insight',
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

    // In this repo's architecture, we might be writing to a local path or a signed URL.
    // If the analyzer returns a signed URL, we use it. If not, we might need to download the buffer.
    // For local dev consistency, we'll assume the analyzer might return a buffer or path.
    // Given the risk-analyzer's code, it returns { success, storage_path, bucket, signed_url, file_size }.

    await prisma.videoUpload.update({
      where: { id: uploadId },
      data: { status: 'COMPLETED' },
    });

    const document = await prisma.document.create({
      data: {
        claimId: upload.claimId,
        type: 'SIGNED_STATEMENT',
        filename: `video-assessment-consent-${upload.id}.pdf`,
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

    return { documentId: document.id, success: true };
  }

  async getClaimUploads(claimId: string) {
    return prisma.videoUpload.findMany({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteUpload(uploadId: string) {
    const upload = await this.getUpload(uploadId);
    try {
      await fs.unlink(upload.videoUrl);
    } catch (error: any) {
      this.logger.error(`Failed to delete video file: ${error.message}`);
    }

    await prisma.videoUpload.delete({
      where: { id: uploadId },
    });

    return { success: true };
  }

  // ==================== Private Helpers ====================

  private async callAnalyzer(path: string, buffer: Buffer, filename: string): Promise<any> {
    const formData = new FormData();
    formData.append('file', new Blob([buffer]), filename);

    const response = await fetch(`${this.analyzerUrl}${path}`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Analyzer error: ${response.statusText}`);
    }

    return await response.json();
  }

  private mapRisk(score: string): number {
    if (score === 'HIGH') return 0.85;
    if (score === 'MEDIUM') return 0.5;
    return 0.15;
  }

  private async getVideoDuration(videoPath: string): Promise<number> {
    const { stdout } = await execAsync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
    );
    return parseFloat(stdout.trim());
  }

  private async extractVideoSegment(
    videoPath: string,
    start: number,
    end: number,
    id: string
  ): Promise<string> {
    const out = path.join(path.dirname(videoPath), `seg-${id}-${start}-${end}.mp4`);
    await execAsync(`ffmpeg -y -i "${videoPath}" -ss ${start} -t ${end - start} -c copy "${out}"`);
    return out;
  }

  private async storeSegmentAnalysis(uploadId: string, _start: number, _end: number, metrics: any) {
    const upload = await this.getUpload(uploadId);
    let session = await prisma.session.findFirst({
      where: { claimId: upload.claimId, status: 'COMPLETED' },
      orderBy: { createdAt: 'desc' },
    });

    if (!session) {
      session = await prisma.session.create({
        data: {
          claimId: upload.claimId,
          roomId: BigInt(Date.now()),
          status: 'COMPLETED',
          analysisStatus: 'PROCESSING',
        },
      });
    }

    await prisma.deceptionScore.create({
      data: {
        sessionId: session.id,
        deceptionScore: metrics.deceptionScore,
        voiceStress: metrics.breakdown.voiceStress,
        visualBehavior: metrics.breakdown.visualBehavior,
        expressionMeasurement: metrics.breakdown.expressionMeasurement,
      },
    });
  }
}
