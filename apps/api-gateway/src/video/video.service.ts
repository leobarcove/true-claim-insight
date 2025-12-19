import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateRoomDto, JoinRoomDto, EndRoomDto } from './dto/video.dto';

@Injectable()
export class VideoService {
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    const serviceUrl = this.configService.get<string>('services.videoService', 'http://localhost:3002');
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

    return this.handleResponse(response);
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
