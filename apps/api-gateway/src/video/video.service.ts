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

    if (!response.ok) {
      throw new Error(`Video service error: ${response.statusText}`);
    }

    // Video service returns data directly without wrapper
    return response.json();
  }

  async getRoom(id: string) {
    const response = await fetch(`${this.baseUrl}/rooms/${id}`);
    
    if (!response.ok) {
      throw new Error(`Video service error: ${response.statusText}`);
    }

    return response.json();
  }

  async joinRoom(id: string, dto: JoinRoomDto) {
    const response = await fetch(`${this.baseUrl}/rooms/${id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      throw new Error(`Video service error: ${response.statusText}`);
    }

    return response.json();
  }

  async endRoom(id: string, dto: EndRoomDto) {
    const response = await fetch(`${this.baseUrl}/rooms/${id}/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    if (!response.ok) {
      throw new Error(`Video service error: ${response.statusText}`);
    }

    return response.json();
  }

  async getSessionsForClaim(claimId: string) {
    const response = await fetch(`${this.baseUrl}/rooms/claim/${claimId}`);

    if (!response.ok) {
      throw new Error(`Video service error: ${response.statusText}`);
    }

    return response.json();
  }

  async getConfigStatus() {
    const response = await fetch(`${this.baseUrl}/rooms/config/status`);
    
    if (!response.ok) {
      throw new Error(`Video service error: ${response.statusText}`);
    }

    return response.json();
  }
}
