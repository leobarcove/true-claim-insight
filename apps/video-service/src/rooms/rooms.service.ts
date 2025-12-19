import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Session, SessionStatus } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { DailyService } from '../daily/daily.service';
import { CreateRoomDto, JoinRoomDto } from './dto/room.dto';

@Injectable()
export class RoomsService {
  private readonly logger = new Logger(RoomsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dailyService: DailyService,
  ) {}

  /**
   * Create a new video room for a claim assessment
   * If an active session already exists for the claim, return that instead
   */
  async createRoom(dto: CreateRoomDto): Promise<{
    session: Session;
    roomUrl: string;
  }> {
    // Verify claim exists
    const claim = await this.prisma.claim.findUnique({
      where: { id: dto.claimId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim ${dto.claimId} not found`);
    }

    // Check for existing active session for this claim
    const existingSession = await this.prisma.session.findFirst({
      where: {
        claimId: dto.claimId,
        status: {
          in: [SessionStatus.WAITING, SessionStatus.SCHEDULED, SessionStatus.IN_PROGRESS],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existingSession && existingSession.roomUrl) {
      this.logger.log(`Returning existing active session ${existingSession.id} for claim ${dto.claimId}`);
      return { session: existingSession, roomUrl: existingSession.roomUrl };
    }

    // Create Daily.co room
    const roomName = `claim-${dto.claimId.slice(0, 8)}-${Date.now()}`;
    const dailyRoom = await this.dailyService.createRoom(roomName);

    // Create session record
    const session = await this.prisma.session.create({
      data: {
        claimId: dto.claimId,
        roomId: BigInt(Date.now()), // Use timestamp as numeric ID
        roomUrl: dailyRoom.url,
        status: dto.scheduledTime ? SessionStatus.SCHEDULED : SessionStatus.WAITING,
        scheduledTime: dto.scheduledTime ? new Date(dto.scheduledTime) : null,
      },
    });

    this.logger.log(`Created room ${dailyRoom.url} for claim ${dto.claimId}`);
    return { session, roomUrl: dailyRoom.url };
  }

  /**
   * Get room details by session ID
   */
  async getRoom(sessionId: string): Promise<Session> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        claim: {
          select: {
            claimNumber: true,
            claimType: true,
            status: true,
          },
        },
      },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    return session;
  }

  /**
   * Get Daily.co token and room info for joining
   */
  async joinRoom(sessionId: string, dto: JoinRoomDto): Promise<{
    roomUrl: string;
    token: string;
    sessionId: string;
  }> {
    const session = await this.getRoom(sessionId);

    // Check if session can be joined
    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Session has already ended');
    }

    if (session.status === SessionStatus.CANCELLED) {
      throw new BadRequestException('Session was cancelled');
    }

    // Get room name from URL
    const roomName = session.roomUrl?.split('/').pop() || '';
    const isOwner = dto.role === 'ADJUSTER';
    const userName = dto.role === 'ADJUSTER' ? 'Adjuster' : 'Claimant';

    // Generate Daily.co meeting token
    const token = await this.dailyService.createMeetingToken(
      roomName,
      dto.userId,
      userName,
      isOwner,
    );

    // Update session status if this is the first join
    if (session.status === SessionStatus.WAITING || session.status === SessionStatus.SCHEDULED) {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { 
          status: SessionStatus.IN_PROGRESS,
          startedAt: new Date(),
        },
      });
    }

    this.logger.log(`User ${dto.userId} (${dto.role}) joining room ${session.roomUrl}`);

    return {
      roomUrl: session.roomUrl || '',
      token,
      sessionId,
    };
  }

  /**
   * End a video session
   */
  async endRoom(sessionId: string, reason?: string): Promise<Session> {
    const session = await this.getRoom(sessionId);

    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Session already ended');
    }

    // Delete Daily.co room if configured
    const roomName = session.roomUrl?.split('/').pop();
    if (roomName) {
      await this.dailyService.deleteRoom(roomName);
    }

    const updated = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        status: SessionStatus.COMPLETED,
        endedAt: new Date(),
      },
    });

    this.logger.log(`Session ${sessionId} ended. Reason: ${reason || 'Normal completion'}`);
    return updated;
  }

  /**
   * Get sessions for a claim
   */
  async getSessionsForClaim(claimId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Cancel a scheduled session
   */
  async cancelSession(sessionId: string): Promise<Session> {
    const session = await this.getRoom(sessionId);

    if (session.status === SessionStatus.IN_PROGRESS) {
      throw new BadRequestException('Cannot cancel an in-progress session');
    }

    if (session.status === SessionStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed session');
    }

    // Delete Daily.co room
    const roomName = session.roomUrl?.split('/').pop();
    if (roomName) {
      await this.dailyService.deleteRoom(roomName);
    }

    return this.prisma.session.update({
      where: { id: sessionId },
      data: { status: SessionStatus.CANCELLED },
    });
  }
}
