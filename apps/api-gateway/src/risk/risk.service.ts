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

  async getAssessments(sessionId: string, tenantId: string, userId?: string, userRole?: string) {
    const response = await fetch(`${this.baseUrl}/assessments/session/${sessionId}`, {
      headers: this.buildHeaders(tenantId, userId, userRole),
    });
    return this.handleResponse(response);
  }

  async getDeceptionScore(sessionId: string, tenantId: string, userId?: string, userRole?: string) {
    const response = await fetch(
      `${this.baseUrl}/assessments/session/${sessionId}/deception-score`,
      {
        headers: this.buildHeaders(tenantId, userId, userRole),
      }
    );
    return this.handleResponse(response);
  }

  async triggerAssessment(
    sessionId: string,
    assessmentType: string,
    tenantId: string,
    userId?: string,
    userRole?: string
  ) {
    const response = await fetch(`${this.baseUrl}/assessments/trigger`, {
      method: 'POST',
      headers: {
        ...this.buildHeaders(tenantId, userId, userRole),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId, assessmentType }),
    });

    return this.handleResponse(response);
  }

  async uploadAudio(fileBuffer: Buffer, sessionId: string, tenantId?: string, userId?: string, userRole?: string) {
    // Use native FormData (Node 18+)
    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: 'audio/webm' });
    form.append('file', blob, 'audio.blob');
    form.append('sessionId', sessionId);

    this.logger.log(`Proxying audio upload for session ${sessionId}, size: ${fileBuffer.length}`);

    const response = await fetch(`${this.baseUrl}/assessments/upload-audio`, {
      method: 'POST',
      headers: this.buildHeaders(tenantId, userId, userRole),
      body: form,
      // Native fetch with FormData sets headers automatically, but we need our custom ones too
    });

    return this.handleResponse(response);
  }

  async uploadScreenshot(fileBuffer: Buffer, sessionId: string, tenantId?: string, userId?: string, userRole?: string) {
    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: 'image/png' });
    form.append('file', blob, 'screenshot.png');
    form.append('sessionId', sessionId);

    this.logger.log(
      `Proxying screenshot upload for session ${sessionId}, size: ${fileBuffer.length}`
    );

    const response = await fetch(`${this.baseUrl}/assessments/upload-screenshot`, {
      method: 'POST',
      headers: this.buildHeaders(tenantId, userId, userRole),
      body: form,
    });

    return this.handleResponse(response);
  }

  async analyzeExpression(fileBuffer: Buffer, sessionId: string, tenantId?: string, userId?: string, userRole?: string) {
    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: 'video/webm' });
    form.append('file', blob, 'expression.webm');
    form.append('sessionId', sessionId);

    this.logger.log(
      `Proxying expression analysis for session ${sessionId}, size: ${fileBuffer.length}`
    );

    const response = await fetch(`${this.baseUrl}/assessments/analyze-expression`, {
      method: 'POST',
      headers: this.buildHeaders(tenantId, userId, userRole),
      body: form,
    });

    return this.handleResponse(response);
  }

  async analyzeVideo(fileBuffer: Buffer, sessionId: string, tenantId?: string, userId?: string, userRole?: string) {
    const form = new FormData();
    const blob = new Blob([fileBuffer], { type: 'video/webm' });
    form.append('file', blob, 'visual-behavior.webm');
    form.append('sessionId', sessionId);

    this.logger.log(
      `Proxying visual analysis for session ${sessionId}, size: ${fileBuffer.length}`
    );

    const response = await fetch(`${this.baseUrl}/assessments/analyze-video`, {
      method: 'POST',
      headers: this.buildHeaders(tenantId, userId, userRole),
      body: form,
    });

    return this.handleResponse(response);
  }

  async generateConsentForm(sessionId: string, tenantId: string, userId?: string, userRole?: string) {
    const response = await fetch(`${this.baseUrl}/assessments/session/${sessionId}/consent-form`, {
      method: 'POST',
      headers: this.buildHeaders(tenantId, userId, userRole),
    });
    return this.handleResponse(response);
  }

  async getTrinityCheck(claimId: string, tenantId: string, userId?: string, userRole?: string) {
    const response = await fetch(`${this.baseUrl}/risk/claims/${claimId}/trinity`, {
      headers: this.buildHeaders(tenantId, userId, userRole),
    });
    return this.handleResponse(response);
  }

  async getDocumentAnalysis(documentId: string, tenantId: string, userId?: string, userRole?: string) {
    const response = await fetch(`${this.baseUrl}/risk/documents/${documentId}/analysis`, {
      headers: this.buildHeaders(tenantId, userId, userRole),
    });
    return this.handleResponse(response);
  }

  private buildHeaders(tenantId?: string, userId?: string, userRole?: string): Record<string, string> {
    const headers: Record<string, string> = {};
    if (tenantId) headers['X-Tenant-Id'] = tenantId;
    if (userId) headers['X-User-Id'] = userId;
    if (userRole) headers['X-User-Role'] = userRole;
    return headers;
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
