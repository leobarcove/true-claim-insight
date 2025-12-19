import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { RiskAssessment, AssessmentType, RiskScore } from '@prisma/client';

@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAssessmentsBySession(sessionId: string): Promise<RiskAssessment[]> {
    return this.prisma.riskAssessment.findMany({
      where: { sessionId },
      orderBy: { id: 'desc' },
    });
  }

  async triggerMockAssessment(sessionId: string, type: string) {
    const assessmentType = this.mapType(type);
    
    // Simulate processing delay
    this.logger.log(`Simulating ${assessmentType} assessment for session ${sessionId}...`);
    
    // Create mock risk data
    const assessment = await this.prisma.riskAssessment.create({
      data: {
        sessionId,
        assessmentType,
        provider: assessmentType === AssessmentType.VOICE_ANALYSIS ? 'Clearspeed (Mock)' : 'Hive AI (Mock)',
        riskScore: this.getRandomRiskScore(),
        confidence: 0.85 + Math.random() * 0.1,
        rawResponse: {
          timestamp: new Date().toISOString(),
          details: assessmentType === AssessmentType.VOICE_ANALYSIS 
            ? 'Vocal stress patterns analyzed. Slight hesitation detected.'
            : 'Visual stream analyzed. No deepfake patterns found.',
          indicators: [
            { name: 'Hesitation', value: Math.random() },
            { name: 'Stress', value: Math.random() }
          ]
        },
      },
    });

    return assessment;
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

  private getRandomRiskScore(): RiskScore {
    const rand = Math.random();
    if (rand < 0.7) return RiskScore.LOW;
    if (rand < 0.9) return RiskScore.MEDIUM;
    return RiskScore.HIGH;
  }
}
