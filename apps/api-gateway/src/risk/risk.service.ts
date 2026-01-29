import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const serviceUrl = this.configService.get<string>(
      'services.riskEngine',
      'http://localhost:3004'
    );
    this.baseUrl = `${serviceUrl}/api/v1`;
  }

  async getAssessments(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/assessments/session/${sessionId}`);
    return this.handleResponse(response);
  }

  async getDeceptionScore(sessionId: string) {
    const response = await fetch(
      `${this.baseUrl}/assessments/session/${sessionId}/deception-score`
    );
    return this.handleResponse(response);
  }

  async triggerAssessment(sessionId: string, assessmentType: string) {
    const response = await fetch(`${this.baseUrl}/assessments/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, assessmentType }),
    });

    return this.handleResponse(response);
  }

  async uploadAudio(fileBuffer: Buffer, sessionId: string) {
    // Use native FormData (Node 18+)
    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: 'audio/webm' });
    form.append('file', blob, 'audio.blob');
    form.append('sessionId', sessionId);

    this.logger.log(`Proxying audio upload for session ${sessionId}, size: ${fileBuffer.length}`);

    const response = await fetch(`${this.baseUrl}/assessments/upload-audio`, {
      method: 'POST',
      body: form,
      // Native fetch with FormData sets headers automatically
    });

    return this.handleResponse(response);
  }

  async analyzeExpression(fileBuffer: Buffer, sessionId: string) {
    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: 'video/webm' });
    form.append('file', blob, 'expression.webm');
    form.append('sessionId', sessionId);

    this.logger.log(
      `Proxying expression analysis for session ${sessionId}, size: ${fileBuffer.length}`
    );

    const response = await fetch(`${this.baseUrl}/assessments/analyze-expression`, {
      method: 'POST',
      body: form,
    });

    return this.handleResponse(response);
  }

  async analyzeVideo(fileBuffer: Buffer, sessionId: string) {
    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: 'video/webm' });
    form.append('file', blob, 'visual-behavior.webm');
    form.append('sessionId', sessionId);

    this.logger.log(
      `Proxying visual analysis for session ${sessionId}, size: ${fileBuffer.length}`
    );

    const response = await fetch(`${this.baseUrl}/assessments/analyze-video`, {
      method: 'POST',
      body: form,
    });

    return this.handleResponse(response);
  }

  async generateConsentForm(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/assessments/session/${sessionId}/consent-form`, {
      method: 'POST',
    });
    return this.handleResponse(response);
  }

  async getTrinityCheck(claimId: string) {
    const response = await fetch(`${this.baseUrl}/risk/claims/${claimId}/trinity`);
    return this.handleResponse(response);
  }

  async getDocumentAnalysis(documentId: string) {
    const response = await fetch(`${this.baseUrl}/risk/documents/${documentId}/analysis`);
    return this.handleResponse(response);
  }

  private async handleResponse(response: Response) {
    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = response.statusText;

      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = Array.isArray(errorJson.message)
            ? errorJson.message.join(', ')
            : errorJson.message;
        }
      } catch (e) {
        errorMessage = errorText || errorMessage;
      }

      throw new Error(`Risk engine error: ${errorMessage}`);
    }

    return response.json();
  }
}
