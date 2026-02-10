import { Injectable, Logger } from '@nestjs/common';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { ConfigService } from '@nestjs/config';
import { CreateRoomDto, JoinRoomDto, EndRoomDto, SaveClientInfoDto } from './dto/video.dto';
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

  async createRoom(dto: CreateRoomDto, tenantId: string) {
    const response = await fetch(`${this.baseUrl}/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': tenantId,
      },
      body: JSON.stringify(dto),
    });

    return this.handleResponse(response);
  }

  async getRoom(id: string) {
    const response = await fetch(`${this.baseUrl}/rooms/${id}`);
    return this.handleResponse(response);
  }

  async getAllSessions(tenantId?: string, page?: number, limit?: number) {
    const url = new URL(`${this.baseUrl}/rooms`);
    if (page) url.searchParams.append('page', page.toString());
    if (limit) url.searchParams.append('limit', limit.toString());
    const response = await fetch(url.toString(), {
      headers: tenantId ? { 'X-Tenant-Id': tenantId } : undefined,
    });
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

  async saveClientInfo(sessionId: string, dto: SaveClientInfoDto) {
    const response = await fetch(`${this.baseUrl}/rooms/${sessionId}/client-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });

    return this.handleResponse(response);
  }

  // --- Video Upload Methods ---

  async uploadAssessment(req: any) {
    const contentType = req.headers['content-type'];
    const url = new URL(req.url, 'http://localhost');
    const response = await fetch(`${this.baseUrl}/uploads/upload-assessment${url.search}`, {
      method: 'POST',
      headers: {
        'content-type': contentType,
      },
      body: req.raw, // Pass the raw stream through
      // @ts-ignore - duplex is needed for streaming bodies in undici/fetch
      duplex: 'half',
    });
    return this.handleResponse(response);
  }

  async getUpload(uploadId: string) {
    const response = await fetch(`${this.baseUrl}/uploads/${uploadId}`);
    return this.handleResponse(response);
  }

  async getAllUploads(tenantId?: string, page?: number, limit?: number) {
    const url = new URL(`${this.baseUrl}/uploads`);
    if (page) url.searchParams.append('page', page.toString());
    if (limit) url.searchParams.append('limit', limit.toString());
    const response = await fetch(url.toString(), {
      headers: tenantId ? { 'X-Tenant-Id': tenantId } : undefined,
    });
    return this.handleResponse(response);
  }

  async getUploadSegments(uploadId: string) {
    const response = await fetch(`${this.baseUrl}/uploads/${uploadId}/segments`);
    return this.handleResponse(response);
  }

  async streamUpload(uploadId: string, res: any, req: any) {
    const range = req.headers.range;
    const response = await fetch(`${this.baseUrl}/uploads/${uploadId}/stream`, {
      headers: range ? { range } : undefined,
    });

    if (!response.ok && response.status !== 206) {
      throw new Error(`Failed to stream from video-service: ${response.statusText}`);
    }

    if (response.status === 206) {
      res.status(206);
      const contentRange = response.headers.get('content-range');
      if (contentRange) res.header('Content-Range', contentRange);
    }

    const contentType = response.headers.get('content-type') || 'video/mp4';
    const contentLength = response.headers.get('content-length');
    const contentDisposition = response.headers.get('content-disposition');

    res.header('Content-Type', contentType);
    if (contentLength) res.header('Content-Length', contentLength);
    if (contentDisposition) res.header('Content-Disposition', contentDisposition);
    res.header('Accept-Ranges', 'bytes');

    if (response.body) {
      try {
        await pipeline(
          Readable.fromWeb(response.body as any),
          res.raw // Use the raw Node response object for piping
        );
      } catch (err: any) {
        if (err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
          this.logger.debug(`Stream premature close for ${uploadId} (client disconnected)`);
          return;
        }
        throw err;
      }
    }
  }

  async processSegment(uploadId: string, dto: { startTime: number; endTime: number }) {
    const response = await fetch(`${this.baseUrl}/uploads/${uploadId}/process-segment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dto),
    });
    return this.handleResponse(response);
  }

  async prepareUpload(uploadId: string) {
    const response = await fetch(`${this.baseUrl}/uploads/${uploadId}/prepare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return this.handleResponse(response);
  }

  async getDeceptionScore(uploadId: string) {
    const response = await fetch(`${this.baseUrl}/uploads/${uploadId}/deception-score`);
    return this.handleResponse(response);
  }

  async generateConsent(uploadId: string) {
    const response = await fetch(`${this.baseUrl}/uploads/${uploadId}/generate-consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    return this.handleResponse(response);
  }

  async getClaimUploads(claimId: string, tenantId: string) {
    const response = await fetch(`${this.baseUrl}/uploads/claim/${claimId}`, {
      headers: { 'X-Tenant-Id': tenantId },
    });
    return this.handleResponse(response);
  }

  async deleteUpload(uploadId: string) {
    const response = await fetch(`${this.baseUrl}/uploads/${uploadId}`, {
      method: 'DELETE',
    });
    return this.handleResponse(response);
  }

  private async handleResponse(response: Response) {
    const text = await response.text();

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorJson = JSON.parse(text);
        if (errorJson.message) {
          errorMessage = Array.isArray(errorJson.message)
            ? errorJson.message.join(', ')
            : errorJson.message;
        }
      } catch (e) {
        errorMessage = text || errorMessage;
      }
      throw new Error(`Video service error: ${errorMessage}`);
    }

    if (!text) return { success: true };

    try {
      return JSON.parse(text);
    } catch (e) {
      this.logger.error(`Failed to parse JSON response: ${text?.substring(0, 100)}`);
      return { success: true, raw: text };
    }
  }
}
