import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ConsentGateService } from '../common/consent/consent-gate.service';
import { PrismaService } from '../config/prisma.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly riskEngineUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly consentGate: ConsentGateService
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

    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      this.logger.error(`Session ${sessionId} not found when triggering analysis`);
      return;
    }

    // Consent gate before anything is sent for analysis: the recording reaches
    // Hume via risk-engine, and voice/facial data is sensitive personal data
    // going offshore. Same gate as the uploads path — a webhook must not be
    // the one entrance that skips it. A refusal is not a failure: the
    // recording is kept and analysis stays PENDING until a basis exists.
    const claim = await this.prisma.claim.findUnique({
      where: { id: session.claimId },
      select: { claimantId: true },
    });
    try {
      await this.consentGate.assertBiometricConsent(claim?.claimantId, session.claimId);
    } catch (error) {
      this.logger.warn(
        `Analysis not triggered for session ${sessionId}: ${(error as Error).message}`
      );
      return;
    }

    // The internal key is required, not optional: risk-engine fails closed
    // without it, and calling anyway would mark the session FAILED for what is
    // actually a local misconfiguration.
    const internalKey = this.configService.get<string>('INTERNAL_API_KEY');
    if (!internalKey) {
      this.logger.error(
        `INTERNAL_API_KEY is not configured — cannot call risk-engine for session ${sessionId}`
      );
      return;
    }

    // Update status to PROCESSING
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { analysisStatus: 'PROCESSING' },
    });

    try {
      const response = await fetch(`${this.riskEngineUrl}/api/v1/assessments/analyze-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': internalKey,
          'x-tenant-id': session.tenantId || 'system',
          'x-user-id': 'service:video-service',
          'x-user-role': 'SUPER_ADMIN',
        },
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
          ...(roomName && !isNaN(Number(roomName)) ? [{ roomId: BigInt(roomName) }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
