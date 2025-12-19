import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../config/prisma.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly riskEngineUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    this.riskEngineUrl = this.configService.get<string>('RISK_ENGINE_URL', 'http://localhost:3004');
  }

  async handleRecordingReady(payload: any) {
    const { room_name, download_link, duration } = payload;
    
    this.logger.log(`Recording ready: room=${room_name}, duration=${duration}s`);
    
    // Find the session by room name or ID
    const session = await this.findSessionByRoom(room_name);
    if (!session) {
      this.logger.warn(`No session found for room: ${room_name}`);
      return;
    }

    // Update session with recording URL
    await this.prisma.session.update({
      where: { id: session.id },
      data: {
        recordingUrl: download_link,
        analysisStatus: 'PENDING',
      },
    });

    // Trigger analysis
    await this.triggerAnalysisForSession(session.id);
  }

  async handleMeetingEnded(payload: any) {
    const { room_name } = payload;
    
    this.logger.log(`Meeting ended: room=${room_name}`);
    
    // Session status update is handled elsewhere
    // This is just for logging/future use
  }

  async triggerAnalysisForSession(sessionId: string) {
    this.logger.log(`Triggering analysis for session: ${sessionId}`);

    // Update status to PROCESSING
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { analysisStatus: 'PROCESSING' },
    });

    try {
      // For now, trigger mock analysis via risk-engine
      // In production, this would download the recording and send it for analysis
      const response = await fetch(`${this.riskEngineUrl}/api/v1/assessments/analyze-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });

      if (!response.ok) {
        throw new Error(`Risk engine returned ${response.status}`);
      }

      // Update status to COMPLETED
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { analysisStatus: 'COMPLETED' },
      });

      this.logger.log(`Analysis completed for session: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Analysis failed for session ${sessionId}: ${error}`);
      
      // Update status to FAILED
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { analysisStatus: 'FAILED' },
      });
    }
  }

  private async findSessionByRoom(roomName: string) {
    // Room name might be in format: "room-{roomId}" or just the daily room name
    // Try to find by roomUrl containing the room name
    return this.prisma.session.findFirst({
      where: {
        OR: [
          { roomUrl: { contains: roomName } },
          // If roomName is numeric, try matching roomId
          ...(roomName && !isNaN(Number(roomName)) 
            ? [{ roomId: BigInt(roomName) }] 
            : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
