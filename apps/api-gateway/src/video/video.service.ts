import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateRoomDto, JoinRoomDto, EndRoomDto } from './dto/video.dto';
import { RiskService } from '../risk/risk.service';

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly riskService: RiskService
  ) {
    const serviceUrl = this.configService.get<string>(
      'services.videoService',
      'http://localhost:3002'
    );
    this.baseUrl = `${serviceUrl}/api/v1`;
  }

  async createRoom(dto: CreateRoomDto) {
    const response = await fetch(`${this.baseUrl}/rooms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    return this.handleResponse(response);
  }

  async getRoom(id: string) {
    const response = await fetch(`${this.baseUrl}/rooms/${id}`);
    return this.handleResponse(response);
  }

  async joinRoom(id: string, dto: JoinRoomDto) {
    const response = await fetch(`${this.baseUrl}/rooms/${id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    return this.handleResponse(response);
  }

  async endRoom(id: string, dto: EndRoomDto) {
    const response = await fetch(`${this.baseUrl}/rooms/${id}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    const result = await this.handleResponse(response);
    try {
      this.logger.log(`Session ${id} ended. Generating consent form...`);
      this.riskService.generateConsentForm(id);
    } catch (error: any) {
      this.logger.error(`Failed to generate consent form for session ${id}: ${error.message}`);
    }

    return result;
  }

  async getSessionsForClaim(claimId: string) {
    const response = await fetch(`${this.baseUrl}/rooms/claim/${claimId}`);
    return this.handleResponse(response);
  }

  async getConfigStatus() {
    const response = await fetch(`${this.baseUrl}/rooms/config/status`);
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

      throw new Error(`Video service error: ${errorMessage}`);
    }

    return response.json();
  }
}
