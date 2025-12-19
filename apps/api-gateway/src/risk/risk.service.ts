import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RiskService {
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
