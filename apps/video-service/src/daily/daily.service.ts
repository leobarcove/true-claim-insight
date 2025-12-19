import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface DailyRoom {
  id: string;
  name: string;
  url: string;
  privacy: 'public' | 'private';
  created_at: string;
  config: Record<string, unknown>;
}

interface DailyMeetingToken {
  token: string;
}

/**
 * Daily.co Video Service
 * Handles video room creation and management via Daily.co API
 * 
 * Much simpler than TRTC - just REST API calls with Bearer token auth
 */
@Injectable()
export class DailyService implements OnModuleInit {
  private readonly logger = new Logger(DailyService.name);
  private readonly apiUrl = 'https://api.daily.co/v1';
  
  private apiKey!: string;
  private domain!: string;
  private isConfigured = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.apiKey = this.configService.get<string>('DAILY_API_KEY', '');
    this.domain = this.configService.get<string>('DAILY_DOMAIN', '');

    if (this.apiKey) {
      this.isConfigured = true;
      this.logger.log('Daily.co configured successfully');
    } else {
      this.logger.warn('Daily.co not configured - DAILY_API_KEY missing');
      this.logger.warn('Video calls will not work until Daily.co is configured');
    }
  }

  /**
   * Check if Daily.co is properly configured
   */
  isReady(): boolean {
    return this.isConfigured;
  }

  /**
   * Get the Daily.co domain
   */
  getDomain(): string {
    return this.domain;
  }

  /**
   * Create a new video room
   * 
   * @param name - Unique room name (optional, auto-generated if not provided)
   * @param expiryMinutes - Minutes until room expires (default: 60)
   * @returns Room details including URL
   */
  async createRoom(name?: string, expiryMinutes = 60): Promise<DailyRoom> {
    if (!this.isConfigured) {
      // Return mock room for development when not configured
      const mockName = name || `mock-room-${Date.now()}`;
      this.logger.warn(`Creating mock room ${mockName} - Daily.co not configured`);
      return {
        id: `mock-${mockName}`,
        name: mockName,
        url: `https://example.daily.co/${mockName}`,
        privacy: 'private',
        created_at: new Date().toISOString(),
        config: {},
      };
    }

    const expiry = Math.floor(Date.now() / 1000) + expiryMinutes * 60;

    const response = await fetch(`${this.apiUrl}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        name,
        privacy: 'private',
        properties: {
          exp: expiry,
          enable_screenshare: true,
          enable_chat: true,
          enable_recording: 'cloud',
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Failed to create room: ${error}`);
      throw new Error(`Daily.co API error: ${response.status}`);
    }

    const room = await response.json() as DailyRoom;
    this.logger.log(`Created room: ${room.url}`);
    return room;
  }

  /**
   * Get room details by name
   */
  async getRoom(name: string): Promise<DailyRoom | null> {
    if (!this.isConfigured) {
      return null;
    }

    const response = await fetch(`${this.apiUrl}/rooms/${name}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Daily.co API error: ${response.status}`);
    }

    return response.json() as Promise<DailyRoom>;
  }

  /**
   * Delete a room
   */
  async deleteRoom(name: string): Promise<boolean> {
    if (!this.isConfigured) {
      return true;
    }

    const response = await fetch(`${this.apiUrl}/rooms/${name}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    return response.ok;
  }

  /**
   * Generate a meeting token for a user to join a room
   * 
   * @param roomName - The room to join
   * @param userId - User identifier
   * @param userName - Display name in the call
   * @param isOwner - Whether the user can control the meeting
   */
  async createMeetingToken(
    roomName: string,
    userId: string,
    userName: string,
    isOwner = false,
  ): Promise<string> {
    if (!this.isConfigured) {
      return `mock-token-${userId}-${Date.now()}`;
    }

    const isDev = this.configService.get<string>('NODE_ENV') === 'development';

    try {
      const response = await fetch(`${this.apiUrl}/meeting-tokens`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          properties: {
            room_name: roomName,
            user_id: userId,
            user_name: userName,
            is_owner: isOwner,
            enable_screenshare: true,
            enable_recording: isOwner ? 'cloud' : undefined,
          },
        }),
        // Add a signal if we wanted explicit timeout, but default undici timeout is what triggered the error
      });

      if (!response.ok) {
        const error = await response.text();
        this.logger.error(`Failed to create token: ${error}`);
        throw new Error(`Daily.co API error: ${response.status}`);
      }

      const data = await response.json() as DailyMeetingToken;
      return data.token;
    } catch (error: any) {
      if (isDev && (error.name === 'ConnectTimeoutError' || error.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message.includes('timeout'))) {
        this.logger.warn(`Daily.co API timeout - falling back to mock token for dev: ${error.message}`);
        return `mock-token-${userId}-${Date.now()}`;
      }
      throw error;
    }
  }
}
