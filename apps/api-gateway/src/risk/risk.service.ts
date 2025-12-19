import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const serviceUrl = this.configService.get<string>('services.riskEngine', 'http://localhost:3004');
    this.baseUrl = `${serviceUrl}/api/v1`;
  }

  async getAssessments(sessionId: string) {
    const response = await fetch(`${this.baseUrl}/assessments/session/${sessionId}`);
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
    const FormData = require('form-data');
    const form = new FormData();
    
    form.append('file', fileBuffer, { filename: 'audio.blob' });
    form.append('sessionId', sessionId);

    this.logger.log(`Proxying audio upload for session ${sessionId}, size: ${fileBuffer.length}`);

    const response = await fetch(`${this.baseUrl}/assessments/upload-audio`, {
      method: 'POST',
      body: form as any,
      headers: {
        ...form.getHeaders(),
      },
    });

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
