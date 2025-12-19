import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { RiskAssessment, AssessmentType, RiskScore } from '@prisma/client';
import { RiskAnalyzerClient } from '../providers/risk-analyzer.client';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly riskAnalyzerClient: RiskAnalyzerClient,
  ) {}

  async getAssessmentsBySession(sessionId: string): Promise<RiskAssessment[]> {
    return this.prisma.riskAssessment.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Trigger a mock assessment (for demo/testing)
   */
  async triggerMockAssessment(sessionId: string, type: string) {
    const assessmentType = this.mapType(type);
    
    this.logger.log(`Creating mock ${assessmentType} assessment for session ${sessionId}...`);
    
    // Create mock risk data with simulated metrics
    const assessment = await this.prisma.riskAssessment.create({
      data: {
        sessionId,
        assessmentType,
        provider: assessmentType === AssessmentType.VOICE_ANALYSIS 
          ? 'Parselmouth (Mock)' 
          : 'MediaPipe (Mock)',
        riskScore: this.getRandomRiskScore(),
        confidence: 0.85 + Math.random() * 0.1,
        rawResponse: this.generateMockMetrics(assessmentType),
      },
    });

    return assessment;
  }

  /**
   * Analyze audio using the Python service
   */
  async analyzeAudioFile(
    sessionId: string,
    audioBuffer: Buffer,
    filename: string,
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

  /**
   * Analyze video using the Python service
   */
  async analyzeVideoFile(
    sessionId: string,
    videoBuffer: Buffer,
    filename: string,
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

  /**
   * Check if Python analyzer service is available
   */
  async isAnalyzerHealthy(): Promise<boolean> {
    return this.riskAnalyzerClient.healthCheck();
  }

  private mapType(type: string): AssessmentType {
    switch (type.toUpperCase()) {
      case 'VOICE': return AssessmentType.VOICE_ANALYSIS;
      case 'VISUAL': return AssessmentType.VISUAL_MODERATION;
      case 'ATTENTION': return AssessmentType.ATTENTION_TRACKING;
      case 'DEEPFAKE': return AssessmentType.DEEPFAKE_CHECK;
      default: return AssessmentType.VOICE_ANALYSIS;
    }
  }

  private mapRiskScore(score: string): RiskScore {
    switch (score) {
      case 'HIGH': return RiskScore.HIGH;
      case 'MEDIUM': return RiskScore.MEDIUM;
      default: return RiskScore.LOW;
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
