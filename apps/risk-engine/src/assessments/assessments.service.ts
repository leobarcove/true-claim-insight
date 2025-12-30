import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { RiskAssessment, AssessmentType, RiskScore } from '@prisma/client';
import { RiskAnalyzerClient } from '../providers/risk-analyzer.client';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);
  private readonly sampleAudioPath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskAnalyzerClient: RiskAnalyzerClient
  ) {
    // Robust path resolution for sample audio.
    // We check multiple potential locations because the execution context (CWD)
    // varies depending on how the service is started (root vs package dir).
    const potentialPaths = [
      // If CWD is pkg root (apps/risk-engine)
      path.join(process.cwd(), 'samples/sample_voice.wav'),
      // If CWD is monorepo root
      path.join(process.cwd(), 'apps/risk-engine/samples/sample_voice.wav'),
      // Relative to dist/assessments/assessments.service.js -> ../../samples
      path.join(__dirname, '../../samples/sample_voice.wav'),
    ];

    const existingPath = potentialPaths.find(p => fs.existsSync(p));
    this.sampleAudioPath = existingPath || potentialPaths[0];

    // Log the resolved path for debugging
    const logger = new Logger('AssessmentsServiceInit');
    logger.log(
      `Sample audio path resolved to: ${this.sampleAudioPath} (Exists: ${!!existingPath})`
    );
  }

  async getAssessmentsBySession(sessionId: string): Promise<RiskAssessment[]> {
    return this.prisma.riskAssessment.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Trigger a real assessment using the Python analyzer
   * Uses sample audio file for voice analysis (simulates live feed)
   */
  async triggerMockAssessment(sessionId: string, type: string) {
    const assessmentType = this.mapType(type);

    this.logger.log(`Triggering assessment: type=${type} -> mapped=${assessmentType}`);

    // For VOICE_ANALYSIS, use real Python analyzer with sample audio
    // Check both Enum and String literal to be robust against import/type issues
    if (
      (assessmentType as any) === 'VOICE_ANALYSIS' ||
      assessmentType === AssessmentType.VOICE_ANALYSIS
    ) {
      return this.triggerRealVoiceAnalysis(sessionId);
    }

    // For other types, still use mock data for now
    this.logger.log(`Creating mock ${assessmentType} assessment for session ${sessionId}...`);

    return this.prisma.riskAssessment.upsert({
      where: {
        sessionId_assessmentType: {
          sessionId,
          assessmentType,
        },
      },
      update: {
        provider: 'MediaPipe (Mock)',
        riskScore: this.getRandomRiskScore(),
        confidence: 0.85 + Math.random() * 0.1,
        rawResponse: this.generateMockMetrics(assessmentType),
      },
      create: {
        sessionId,
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
  async processUploadedAudio(fileBuffer: Buffer, sessionId: string) {
    try {
      this.logger.log(
        `Processing uploaded audio for session ${sessionId}, size: ${fileBuffer.length} bytes`
      );

      // Convert WebM to WAV using ffmpeg-static
      const util = require('util');
      const exec = util.promisify(require('child_process').exec);
      const fs = require('fs');
      const os = require('os');
      const path = require('path');
      const ffmpegPath = require('ffmpeg-static');

      const tmpDir = os.tmpdir();
      const inputPath = path.join(tmpDir, `input-${sessionId}-${Date.now()}.webm`);
      const outputPath = path.join(tmpDir, `output-${sessionId}-${Date.now()}.wav`);

      await fs.promises.writeFile(inputPath, fileBuffer);

      try {
        this.logger.log(
          `Converting audio using ffmpeg at ${ffmpegPath}: ${inputPath} -> ${outputPath}`
        );
        await exec(`"${ffmpegPath}" -y -i "${inputPath}" "${outputPath}"`);

        const wavBuffer = await fs.promises.readFile(outputPath);
        this.logger.log(`Conversion complete. WAV size: ${wavBuffer.length}`);

        const result = await this.riskAnalyzerClient.analyzeAudio(wavBuffer, 'claimant-upload.wav');

        // Cleanup
        setTimeout(() => {
          fs.unlink(inputPath, () => {});
          fs.unlink(outputPath, () => {});
        }, 1000);

        // Save result to DB
        const assessment = await this.prisma.riskAssessment.upsert({
          where: {
            sessionId_assessmentType: {
              sessionId,
              assessmentType: AssessmentType.VOICE_ANALYSIS,
            },
          },
          update: {
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
          create: {
            sessionId,
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
      } catch (err: any) {
        this.logger.error(`Conversion or Analysis failed: ${err.message}`);
        throw err;
      }
    } catch (error: any) {
      this.logger.error(`Failed to process uploaded audio: ${error.message}`);
      throw error;
    }
  }

  async processUploadedExpression(fileBuffer: Buffer, sessionId: string) {
    const path = require('path');
    const fs = require('fs');

    const projectRoot = process.cwd();
    const tmpDir = path.join(projectRoot, '.tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const videoPath = path.join(tmpDir, `expression-${sessionId}-${Date.now()}.webm`);

    try {
      this.logger.log(
        `Processing expression analysis for session ${sessionId}, size: ${fileBuffer.length} bytes`
      );

      await fs.promises.writeFile(videoPath, fileBuffer);
      this.logger.log(`Video saved to temporary path: ${videoPath}`);

      const result = await this.riskAnalyzerClient.analyzeExpression(videoPath, 'expression.webm');
      const assessment = await this.prisma.riskAssessment.upsert({
        where: {
          sessionId_assessmentType: {
            sessionId,
            assessmentType: AssessmentType.VISUAL_MODERATION,
          },
        },
        update: {
          provider: result.metrics?.provider || 'HumeAI-Expression-Measurement',
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            analysisMethod: 'expression_measurement',
            timestamp: new Date().toISOString(),
          },
        },
        create: {
          sessionId,
          assessmentType: AssessmentType.VISUAL_MODERATION,
          provider: result.metrics?.provider || 'HumeAI-Expression-Measurement',
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            analysisMethod: 'expression_measurement',
            timestamp: new Date().toISOString(),
          },
        },
      });

      this.logger.log(`Expression analysis complete for session ${sessionId}`);
      return assessment;
    } catch (error: any) {
      this.logger.error(`Expression analysis failed: ${error.message}`);
      throw error;
    } finally {
      try {
        if (fs.existsSync(videoPath)) {
          await fs.promises.unlink(videoPath);
          this.logger.log(`Temporary video file removed: ${videoPath}`);
        }
      } catch (cleanupError: any) {
        this.logger.warn(`Failed to cleanup temp file ${videoPath}: ${cleanupError.message}`);
      }
    }
  }

  // Helper mapping method
  private mapType(type: string): AssessmentType {
    const map: Record<string, AssessmentType> = {
      VOICE: AssessmentType.VOICE_ANALYSIS,
      VISUAL: AssessmentType.VISUAL_MODERATION,
      ATTENTION: AssessmentType.ATTENTION_TRACKING,
      DEEPFAKE: AssessmentType.DEEPFAKE_CHECK,
    };

    // Return mapped type or fallback to VOICE_ANALYSIS for simplicity/demos
    // (In production, strict validation would be better)
    return map[type.toUpperCase()] || (type as AssessmentType);
  }

  // ... existing code ...

  /**
   * Trigger real voice analysis using the Python analyzer with sample audio
   */
  private async triggerRealVoiceAnalysis(sessionId: string): Promise<RiskAssessment> {
    this.logger.log(`Triggering REAL voice analysis for session ${sessionId}...`);

    try {
      // Read sample audio file
      const audioBuffer = fs.readFileSync(this.sampleAudioPath);
      this.logger.log(`Loaded sample audio: ${audioBuffer.length} bytes`);

      // Call Python analyzer
      const result = await this.riskAnalyzerClient.analyzeAudio(audioBuffer, 'sample_voice.wav');
      this.logger.log(
        `Python analyzer returned: risk_score=${result.risk_score}, confidence=${result.confidence}`
      );

      // Upsert assessment with real results
      return this.prisma.riskAssessment.upsert({
        where: {
          sessionId_assessmentType: {
            sessionId,
            assessmentType: AssessmentType.VOICE_ANALYSIS,
          },
        },
        update: {
          provider: 'Parselmouth (Real)',
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            analysisMethod: 'sample_audio',
            timestamp: new Date().toISOString(),
          },
        },
        create: {
          sessionId,
          assessmentType: AssessmentType.VOICE_ANALYSIS,
          provider: 'Parselmouth (Real)',
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            analysisMethod: 'sample_audio',
            timestamp: new Date().toISOString(),
          },
        },
      });
    } catch (error: any) {
      this.logger.error(`Real voice analysis failed: ${error.message}`);

      // Fallback to mock on error
      return this.prisma.riskAssessment.upsert({
        where: {
          sessionId_assessmentType: {
            sessionId,
            assessmentType: AssessmentType.VOICE_ANALYSIS,
          },
        },
        update: {
          provider: 'Parselmouth (Error - Mock Fallback)',
          riskScore: RiskScore.MEDIUM,
          confidence: 0.5,
          rawResponse: {
            error: error.message,
            fallback: true,
            timestamp: new Date().toISOString(),
          },
        },
        create: {
          sessionId,
          assessmentType: AssessmentType.VOICE_ANALYSIS,
          provider: 'Parselmouth (Error - Mock Fallback)',
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

      return this.prisma.riskAssessment.upsert({
        where: {
          sessionId_assessmentType: {
            sessionId,
            assessmentType: AssessmentType.VOICE_ANALYSIS,
          },
        },
        update: {
          provider: 'Parselmouth',
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            timestamp: new Date().toISOString(),
          },
        },
        create: {
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

      return this.prisma.riskAssessment.upsert({
        where: {
          sessionId_assessmentType: {
            sessionId,
            assessmentType: AssessmentType.VISUAL_MODERATION,
          },
        },
        update: {
          provider: 'MediaPipe',
          riskScore: this.mapRiskScore(result.risk_score),
          confidence: result.confidence,
          rawResponse: {
            ...result.metrics,
            details: result.details,
            timestamp: new Date().toISOString(),
          },
        },
        create: {
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

  /**
   * Check if Python analyzer service is available
   */
  async isAnalyzerHealthy(): Promise<boolean> {
    return this.riskAnalyzerClient.healthCheck();
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
}
