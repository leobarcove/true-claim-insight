import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface AudioAnalysisResult {
  success: boolean;
  risk_score: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  metrics: {
    jitter_percent: number;
    shimmer_percent: number;
    pitch_sd_hz: number;
    mean_pitch_hz: number;
    hnr_db: number;
    duration_s: number;
  };
  details?: string;
}

export interface VideoAnalysisResult {
  success: boolean;
  risk_score: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number;
  metrics: {
    blink_count: number;
    blink_rate_per_min: number;
    avg_blink_duration_ms: number;
    avg_lip_tension: number;
    avg_ear: number;
    duration_s: number;
    frames_analyzed: number;
  };
  details?: string;
}

@Injectable()
export class RiskAnalyzerClient {
  private readonly logger = new Logger(RiskAnalyzerClient.name);
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'RISK_ANALYZER_URL',
      'http://localhost:3005'
    );
  }

  async analyzeAudio(
    audioBuffer: Buffer,
    filename: string,
    baselineJitter: number = 0.8,
    baselinePitchSd: number = 15.0
  ): Promise<AudioAnalysisResult> {
    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer]), filename);

    const url = `${this.baseUrl}/analyze-audio?baseline_jitter=${baselineJitter}&baseline_pitch_sd=${baselinePitchSd}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Audio analysis failed: ${error}`);
      }

      return await response.json() as AudioAnalysisResult;
    } catch (error) {
      this.logger.error(`Audio analysis error: ${error}`);
      throw error;
    }
  }

  async analyzeVideo(
    videoBuffer: Buffer,
    filename: string,
    baselineBlinkRate: number = 17.0,
    baselineLipTension: number = 1.0
  ): Promise<VideoAnalysisResult> {
    const formData = new FormData();
    formData.append('file', new Blob([videoBuffer]), filename);

    const url = `${this.baseUrl}/analyze-video?baseline_blink_rate=${baselineBlinkRate}&baseline_lip_tension=${baselineLipTension}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Video analysis failed: ${error}`);
      }

      return await response.json() as VideoAnalysisResult;
    } catch (error) {
      this.logger.error(`Video analysis error: ${error}`);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      const data = await response.json() as { status: string };
      return data.status === 'healthy';
    } catch (error) {
      this.logger.warn(`Risk analyzer health check failed: ${error}`);
      return false;
    }
  }
}
