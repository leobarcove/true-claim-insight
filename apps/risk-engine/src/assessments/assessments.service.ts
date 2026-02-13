import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { AssessmentType, RiskScore, DocumentType, RiskAssessment } from '@prisma/client';
import { RiskAnalyzerClient } from '../providers/risk-analyzer.client';
import { TenantContext } from '../common/guards/tenant.guard';
import { TenantService } from '../tenant/tenant.service';
import * as fs from 'fs';

import * as path from 'path';
import * as os from 'os';
import * as util from 'util';
import { exec } from 'child_process';
const ffmpegPath = require('ffmpeg-static');

const execAsync = util.promisify(exec);

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);
  private readonly sampleAudioPath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly riskAnalyzerClient: RiskAnalyzerClient
  ) {
    const potentialPaths = [
      path.join(process.cwd(), 'samples/sample_voice.wav'),
      path.join(process.cwd(), 'apps/risk-engine/samples/sample_voice.wav'),
      path.join(__dirname, '../../samples/sample_voice.wav'),
    ];

    const existingPath = potentialPaths.find(p => fs.existsSync(p));
    this.sampleAudioPath = existingPath || potentialPaths[0];
  }

  async getAssessmentsBySession(sessionId: string, tenantContext: TenantContext): Promise<any[]> {
    await this.tenantService.validateSessionAccess(sessionId, tenantContext);
    return this.prisma.riskAssessment.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async calculateDeceptionScore(sessionId: string, tenantContext: TenantContext): Promise<any> {
    await this.tenantService.validateSessionAccess(sessionId, tenantContext);

    const assessments = await this.prisma.riskAssessment.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });

    const latestVoice = assessments.find(a => a.assessmentType === AssessmentType.VOICE_ANALYSIS);
    const latestVisual = assessments.find(
      a =>
        a.assessmentType === AssessmentType.ATTENTION_TRACKING ||
        (a.assessmentType === AssessmentType.VISUAL_MODERATION && !a.provider.startsWith('HumeAI'))
    );
    const latestExpression = assessments.find(
      a => a.assessmentType === AssessmentType.VISUAL_MODERATION && a.provider.startsWith('HumeAI')
    );

    const w = 0.33;
    const wvs = latestVoice ? this.normalizeVoiceStress(latestVoice.rawResponse) : 0;
    const wvb = latestVisual ? this.normalizeVisualBehavior(latestVisual.rawResponse) : 0;
    const wem = latestExpression ? this.calculateExpressionScore(latestExpression.rawResponse) : 0;

    const deceptionScore = w * wvs + w * wvb + w * wem;
    const isHighRisk = deceptionScore > 0.7;

    let processedUntil = 0;
    assessments.forEach(a => {
      const endTime = (a.rawResponse as any)?.endTime || 0;
      if (endTime > processedUntil) processedUntil = endTime;
    });

    await this.prisma.deceptionScore.create({
      data: {
        sessionId,
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId,
        deceptionScore: isNaN(deceptionScore) ? 0 : deceptionScore,
        voiceStress: isNaN(wvs) ? 0 : wvs,
        visualBehavior: isNaN(wvb) ? 0 : wvb,
        expressionMeasurement: isNaN(wem) ? 0 : wem,
      } as any,
    });

    return {
      deceptionScore: parseFloat(deceptionScore.toFixed(4)),
      isHighRisk,
      processedUntil: Number(processedUntil.toFixed(2)),
      breakdown: {
        voiceStress: parseFloat(wvs.toFixed(4)),
        visualBehavior: parseFloat(wvb.toFixed(4)),
        expressionMeasurement: parseFloat(wem.toFixed(4)),
      },
      latestDataTimestamp: assessments[0]?.createdAt || null,
    };
  }

  async generateConsentForm(sessionId: string, tenantContext: TenantContext) {
    await this.tenantService.validateSessionAccess(sessionId, tenantContext);

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
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
                    phoneNumber: true,
                  },
                },
              },
            },
            insurerTenant: true,
            documents: true,
          },
        },
      },
    });

    if (!session || !session.claim || !session.claim.claimant) {
      throw new Error('Session or Claim Data missing');
    }

    const scores = await this.calculateDeceptionScore(sessionId, tenantContext);
    const payload = {
      sessionId,
      claimId: session.claimId,
      claimant: {
        name: session.claim.claimant.fullName || 'N/A',
        nric:
          session.claim.claimant.nric ||
          session.claim.nric ||
          session.claim.claimant.nricHash ||
          'N/A',
        phone: session.claim.claimant.phoneNumber || 'N/A',
        email: session.claim.claimant.email || 'N/A',
      },
      claim: {
        claimNumber: session.claim.claimNumber,
        policyNumber: session.claim.policyNumber,
        incidentDate: session.claim.incidentDate,
        claimType: session.claim.claimType,
        vehiclePlate: session.claim.vehiclePlateNumber || 'N/A',
        vehicleYear: session.claim.vehicleYear?.toString() || 'N/A',
        vehicleMake: session.claim.vehicleMake || 'N/A',
        vehicleModel: session.claim.vehicleModel || 'N/A',
        engineNumber: session.claim.vehicleEngineNumber || 'N/A',
        chassisNumber: session.claim.vehicleChassisNumber || 'N/A',
        location: (session.claim.incidentLocation as any)?.address || 'N/A',
        description: session.claim.description,
      },
      analysis: {
        riskScore: scores.isHighRisk ? 'HIGH' : 'LOW',
        deceptionScore: scores.deceptionScore,
        breakdown: scores.breakdown,
      },
      adjuster: {
        name: session.claim.adjuster?.user?.fullName || 'N/A',
        firmName:
          session.claim.adjuster?.tenant?.name || session.claim.insurerTenant?.name || 'N/A',
        firmAddress:
          (session.claim.adjuster?.tenant?.settings as any)?.address ||
          (session.claim.insurerTenant?.settings as any)?.address ||
          'No. 202 Jalan Raja Laut\nKuala Lumpur City Centre 50450\nKuala Lumpur, Malaysia',
        firmPhone:
          (session.claim.adjuster?.tenant?.settings as any)?.phone ||
          (session.claim.insurerTenant?.settings as any)?.phone ||
          session.claim.adjuster?.user?.phoneNumber ||
          '+60 3-2789 4567',
        firmLogo:
          (session.claim.adjuster?.tenant?.settings as any)?.logoUrl ||
          (session.claim.insurerTenant?.settings as any)?.logoUrl ||
          'N/A',
      },
    };

    const result = await this.riskAnalyzerClient.generateConsent(payload);
    if (result.success && result.storage_path) {
      await this.prisma.document.create({
        data: {
          claimId: session.claimId,
          tenantId: tenantContext.tenantId,
          userId: tenantContext.userId,
          type: DocumentType.SIGNED_STATEMENT,
          filename: `consent_${sessionId}.pdf`,
          storageUrl: result.signed_url,
          fileSize: result.file_size,
          mimeType: 'application/pdf',
          metadata: { bucket: result.bucket, sessionId, storage_path: result.storage_path },
        },
      });
      return { success: true, url: result.signed_url };
    }

    throw new Error('Failed to generate consent form');
  }

  private normalizeVoiceStress(metrics: any): number {
    const m = metrics.metrics || metrics;
    if (!m) return 0;

    const jitter = m.jitter_percent ?? 0;
    const shimmer = m.shimmer_percent ?? 0;
    const pitchSd = m.pitch_sd_hz ?? 0;
    const hnr = m.hnr_db ?? 15;

    const jitterNorm = Math.min(1, Math.max(0, (jitter - 0.8) / 7.0));
    const shimmerNorm = Math.min(1, Math.max(0, (shimmer - 2.0) / 15.0));
    const pitchSdNorm = Math.min(1, Math.max(0, (pitchSd - 15) / 150));
    const hnrNorm = Math.min(1, Math.max(0, (15 - hnr) / 20));

    // Reduced weights to make overall score less sensitive
    const weights = { jitter: 0.25, shimmer: 0.25, pitchSd: 0.2, hnr: 0.1 };
    const rawScore =
      jitterNorm * weights.jitter +
      shimmerNorm * weights.shimmer +
      pitchSdNorm * weights.pitchSd +
      hnrNorm * weights.hnr;

    // Use a steeper power curve (square) to make it less sensitive to low-level noise/variations
    return Math.pow(rawScore, 2);
  }

  private normalizeVisualBehavior(metrics: any): number {
    if (!metrics) return 0;

    // Components: Blink Rate deviation + Lip Compression + Blink Duration irregularity

    // 1. Blink Rate: Normal is 12-25. Risk increases as it deviates from ~18.
    const blinkRate = metrics.blink_rate_per_min || 18;
    const blinkDev = Math.min(0.4, Math.abs(blinkRate - 18) / 20);

    // 2. Lip Tension: In video_analyzer, lower ratio = more compressed lips (stress/suppression).
    // Normal ratio is around 0.4 - 0.5. Ratios below 0.3 indicate tension.
    const lipRatio = metrics.avg_lip_tension ?? metrics.lip_tension ?? 0.45;
    const lipCompressionRisk = Math.min(0.4, Math.max(0, 0.4 - lipRatio) * 1.5);

    // 3. Blink Duration: Normal is ~100-250ms.
    const blinkDur = metrics.avg_blink_duration_ms ?? metrics.blink_duration ?? 150;
    const blinkDurRisk = Math.min(0.2, Math.abs(blinkDur - 150) / 500);

    const combinedScore = blinkDev + lipCompressionRisk + blinkDurRisk;

    // Ensure final score is between 0 and 1
    return Math.min(1, Math.max(0, combinedScore));
  }

  private calculateExpressionScore(metrics: any): number {
    if (!metrics) return 0;

    let emotionsArray = metrics;
    if (metrics.top_emotions && Array.isArray(metrics.top_emotions)) {
      emotionsArray = metrics.top_emotions;
    }

    const fraudEmotions = [
      'Guilt',
      'Shame',
      'Anxiety',
      'Doubt',
      'Fear',
      'Embarrassment',
      'Distress',
    ];
    let maxFraud = 0;

    if (Array.isArray(emotionsArray)) {
      emotionsArray.forEach((m: any) => {
        if (m.name && fraudEmotions.includes(m.name)) {
          maxFraud = Math.max(maxFraud, m.score || 0);
        }
      });
    } else if (typeof emotionsArray === 'object') {
      for (const [key, value] of Object.entries(emotionsArray)) {
        if (fraudEmotions.includes(key)) {
          maxFraud = Math.max(maxFraud, Number(value) || 0);
        }
      }
    }

    // Subtract alignment threshold (only flag if significantly elevated)
    const alignment = 0.1;
    const score = Math.max(0, maxFraud - alignment);
    this.logger.log(
      `Expression calculation: maxFraud=${maxFraud.toFixed(3)}, score=${score.toFixed(3)}, ` +
        `hasData=${!!emotionsArray}, isArray=${Array.isArray(emotionsArray)}`
    );

    if (Array.isArray(emotionsArray) && emotionsArray.length > 0) {
      const sample = emotionsArray
        .slice(0, 3)
        .map((e: any) => `${e.name}:${(e.score || 0).toFixed(2)}`)
        .join(', ');
      this.logger.log(`Top emotions: ${sample}`);
    }

    return score;
  }

  /**
   * Trigger a real assessment using the Python analyzer
   * Uses sample audio file for voice analysis (simulates live feed)
   */
  async triggerMockAssessment(sessionId: string, type: string, tenantContext: TenantContext) {
    await this.tenantService.validateSessionAccess(sessionId, tenantContext);
    const assessmentType = this.mapType(type);

    if (
      (assessmentType as any) === 'VOICE_ANALYSIS' ||
      assessmentType === AssessmentType.VOICE_ANALYSIS
    ) {
      return this.triggerRealVoiceAnalysis(sessionId, tenantContext);
    }

    return this.prisma.riskAssessment.create({
      data: {
        sessionId,
        tenantId: tenantContext.tenantId,
        assessmentType,
        provider: 'MediaPipe (Mock)',
        riskScore: this.getRandomRiskScore(),
        confidence: 0.85 + Math.random() * 0.1,
        rawResponse: this.generateMockMetrics(assessmentType),
      },
    });
  }

  /**
   * Process uploaded audio file buffer for real analysis
   */
  async processUploadedAudio(fileBuffer: Buffer, sessionId: string, tenantContext: TenantContext) {
    await this.tenantService.validateSessionAccess(sessionId, tenantContext);

    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `input-${sessionId}-${Date.now()}.webm`);
    const outputPath = path.join(tmpDir, `output-${sessionId}-${Date.now()}.wav`);

    await fs.promises.writeFile(inputPath, fileBuffer);

    try {
      await execAsync(`"${ffmpegPath}" -y -i "${inputPath}" "${outputPath}"`);
      const wavBuffer = await fs.promises.readFile(outputPath);
      const result = await this.riskAnalyzerClient.analyzeAudio(wavBuffer, 'claimant-upload.wav');
      const assessment = await this.prisma.riskAssessment.create({
        data: {
          sessionId,
          tenantId: await this.resolveTenantId(sessionId, tenantContext),
          assessmentType: AssessmentType.VOICE_ANALYSIS,
          provider: 'Parselmouth (Real - Upload)',
          riskScore: result.risk_score as RiskScore,
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            timestamp: new Date().toISOString(),
            analysisMethod: 'live_upload',
          },
        },
      });

      return assessment;
    } finally {
      fs.unlink(inputPath, () => {});
      fs.unlink(outputPath, () => {});
    }
  }

  async processUploadedExpression(
    fileBuffer: Buffer,
    sessionId: string,
    tenantContext: TenantContext
  ) {
    await this.tenantService.validateSessionAccess(sessionId, tenantContext);
    const tempInputPath = path.join(os.tmpdir(), `input-expr-${sessionId}-${Date.now()}.webm`);
    const tempOutputPath = path.join(os.tmpdir(), `output-expr-${sessionId}-${Date.now()}.webm`);

    try {
      await fs.promises.writeFile(tempInputPath, fileBuffer);
      await execAsync(`"${ffmpegPath}" -y -i "${tempInputPath}" -c copy "${tempOutputPath}"`);

      const result = await this.riskAnalyzerClient.analyzeExpression(
        tempOutputPath,
        'expression.webm'
      );
      return this.prisma.riskAssessment.create({
        data: {
          sessionId,
          tenantId: await this.resolveTenantId(sessionId, tenantContext),
          assessmentType: AssessmentType.VISUAL_MODERATION,
          provider: result.metrics?.provider || 'HumeAI-Expression-Measurement',
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            timestamp: new Date().toISOString(),
            analysisMethod: 'expression_measurement',
          },
        },
      });
    } finally {
      if (fs.existsSync(tempInputPath)) await fs.promises.unlink(tempInputPath).catch(() => {});
      if (fs.existsSync(tempOutputPath)) await fs.promises.unlink(tempOutputPath).catch(() => {});
    }
  }

  async processUploadedVideo(fileBuffer: Buffer, sessionId: string, tenantContext: TenantContext) {
    await this.tenantService.validateSessionAccess(sessionId, tenantContext);
    const tempInputPath = path.join(os.tmpdir(), `input-video-${sessionId}-${Date.now()}.webm`);
    const tempOutputPath = path.join(os.tmpdir(), `output-video-${sessionId}-${Date.now()}.webm`);

    try {
      await fs.promises.writeFile(tempInputPath, fileBuffer);
      await execAsync(`"${ffmpegPath}" -y -i "${tempInputPath}" -c copy "${tempOutputPath}"`);

      const fixedBuffer = await fs.promises.readFile(tempOutputPath);
      const result = await this.riskAnalyzerClient.analyzeVideo(
        fixedBuffer,
        'visual-behavior.webm'
      );

      const analysisType = (result.metrics as any).analysis_type;
      const provider =
        analysisType === 'error_mediapipe_unavailable'
          ? 'MediaPipe (Error: Unavailable)'
          : 'MediaPipe (Real - Upload)';

      return this.prisma.riskAssessment.create({
        data: {
          sessionId,
          tenantId: await this.resolveTenantId(sessionId, tenantContext),
          assessmentType: AssessmentType.VISUAL_MODERATION,
          provider,
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            timestamp: new Date().toISOString(),
            analysisMethod: 'live_upload_video',
          },
        },
      });
    } finally {
      if (fs.existsSync(tempInputPath)) fs.unlink(tempInputPath, () => {});
      if (fs.existsSync(tempOutputPath)) fs.unlink(tempOutputPath, () => {});
    }
  }

  private async triggerRealVoiceAnalysis(
    sessionId: string,
    tenantContext: TenantContext
  ): Promise<any> {
    try {
      const audioBuffer = fs.readFileSync(this.sampleAudioPath);
      const result = await this.riskAnalyzerClient.analyzeAudio(audioBuffer, 'sample_voice.wav');

      return this.prisma.riskAssessment.create({
        data: {
          sessionId,
          tenantId: tenantContext.tenantId,
          assessmentType: AssessmentType.VOICE_ANALYSIS,
          provider: 'Parselmouth (Real)',
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            timestamp: new Date().toISOString(),
            analysisMethod: 'sample_audio',
          },
        },
      });
    } catch (error: any) {
      return this.prisma.riskAssessment.create({
        data: {
          sessionId,
          tenantId: tenantContext.tenantId,
          assessmentType: AssessmentType.VOICE_ANALYSIS,
          provider: 'Parselmouth (Error - Fallback)',
          riskScore: RiskScore.MEDIUM,
          confidence: 0.5,
          rawResponse: {
            error: error.message,
            fallback: true,
            timestamp: new Date().toISOString(),
          },
        },
      });
    }
  }

  /**
   * Analyze audio using the Python service
   */
  async analyzeAudioFile(
    sessionId: string,
    audioBuffer: Buffer,
    filename: string
  ): Promise<RiskAssessment> {
    this.logger.log(`Analyzing audio for session ${sessionId}...`);

    try {
      const result = await this.riskAnalyzerClient.analyzeAudio(audioBuffer, filename);

      return this.prisma.riskAssessment.create({
        data: {
          sessionId,
          assessmentType: AssessmentType.VOICE_ANALYSIS,
          provider: 'Parselmouth',
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      this.logger.error(`Audio analysis failed: ${error}`);
      throw error;
    }
  }

  private async resolveTenantId(sessionId: string, tenantContext: TenantContext): Promise<string> {
    if (tenantContext.userRole !== 'SYSTEM' && tenantContext.tenantId !== 'system') {
      return tenantContext.tenantId;
    }
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { tenantId: true },
    });
    return session?.tenantId || tenantContext.tenantId;
  }

  /**
   * Analyze video using the Python service
   */
  async analyzeVideoFile(
    sessionId: string,
    videoBuffer: Buffer,
    filename: string
  ): Promise<RiskAssessment> {
    this.logger.log(`Analyzing video for session ${sessionId}...`);

    try {
      const result = await this.riskAnalyzerClient.analyzeVideo(videoBuffer, filename);

      return this.prisma.riskAssessment.create({
        data: {
          sessionId,
          assessmentType: AssessmentType.VISUAL_MODERATION,
          provider: 'MediaPipe',
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      this.logger.error(`Video analysis failed: ${error}`);
      throw error;
    }
  }

  private mapType(type: string): AssessmentType {
    const map: Record<string, AssessmentType> = {
      VOICE: AssessmentType.VOICE_ANALYSIS,
      VISUAL: AssessmentType.ATTENTION_TRACKING,
      ATTENTION: AssessmentType.ATTENTION_TRACKING,
      DEEPFAKE: AssessmentType.DEEPFAKE_CHECK,
    };
    return map[type.toUpperCase()] || (type as AssessmentType);
  }

  private mapRiskScore(score: string): RiskScore {
    switch (score) {
      case 'HIGH':
        return RiskScore.HIGH;
      case 'MEDIUM':
        return RiskScore.MEDIUM;
      default:
        return RiskScore.LOW;
    }
  }

  private getRandomRiskScore(): RiskScore {
    const rand = Math.random();
    if (rand < 0.7) return RiskScore.LOW;
    if (rand < 0.9) return RiskScore.MEDIUM;
    return RiskScore.HIGH;
  }

  private generateMockMetrics(type: AssessmentType): object {
    const timestamp = new Date().toISOString();

    if (type === AssessmentType.VOICE_ANALYSIS) {
      return {
        timestamp,
        jitter_percent: +(0.5 + Math.random() * 1.5).toFixed(3),
        shimmer_percent: +(1.5 + Math.random() * 3).toFixed(3),
        pitch_sd_hz: +(10 + Math.random() * 30).toFixed(2),
        mean_pitch_hz: +(100 + Math.random() * 150).toFixed(2),
        hnr_db: +(10 + Math.random() * 15).toFixed(2),
        duration_s: +(5 + Math.random() * 25).toFixed(2),
      };
    } else {
      return {
        timestamp,
        blink_count: Math.floor(5 + Math.random() * 20),
        blink_rate_per_min: +(12 + Math.random() * 10).toFixed(2),
        avg_blink_duration_ms: +(100 + Math.random() * 150).toFixed(2),
        avg_lip_tension: +(0.8 + Math.random() * 0.4).toFixed(4),
        avg_ear: +(0.2 + Math.random() * 0.1).toFixed(4),
        duration_s: +(10 + Math.random() * 50).toFixed(2),
        frames_analyzed: Math.floor(100 + Math.random() * 500),
      };
    }
  }

  async isAnalyzerHealthy(): Promise<boolean> {
    return this.riskAnalyzerClient.healthCheck();
  }
}
