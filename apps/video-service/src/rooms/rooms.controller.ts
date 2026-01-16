import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, JoinRoomDto, EndRoomDto } from './dto/room.dto';
import { DailyService } from '../daily/daily.service';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly dailyService: DailyService
  ) {}

  @Post()
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new video room for a claim' })
  @ApiResponse({ status: 201, description: 'Room created successfully' })
  @ApiResponse({ status: 404, description: 'Claim not found' })
  async createRoom(@Body() dto: CreateRoomDto) {
    const { session, roomUrl } = await this.roomsService.createRoom(dto);
    return {
      sessionId: session.id,
      roomUrl,
      status: session.status,
      scheduledTime: session.scheduledTime,
      dailyConfigured: this.dailyService.isReady(),
    };
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get room/session details' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Room details' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getRoom(@Param('id') id: string) {
    const s = await this.roomsService.getRoom(id);
    return {
      id: s.id,
      claimId: s.claimId,
      roomUrl: s.roomUrl,
      status: s.status,
      scheduledTime: s.scheduledTime,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationSeconds: s.durationSeconds,
      recordingUrl: s.recordingUrl,
      analysisStatus: s.analysisStatus,
      createdAt: s.createdAt,
      claim: s.claim,
      deceptionScores: s.deceptionScores,
    };
  }

  @Post(':id/join')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get Daily.co token to join a room' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({
    status: 200,
    description: 'Join credentials',
    schema: {
      type: 'object',
      properties: {
        roomUrl: { type: 'string' },
        token: { type: 'string' },
        sessionId: { type: 'string' },
      },
    },
  })
  async joinRoom(@Param('id') id: string, @Body() dto: JoinRoomDto) {
    console.log(`[RoomsController] Join attempt for session ${id}:`, JSON.stringify(dto));
    return this.roomsService.joinRoom(id, dto);
  }

  @Post(':id/end')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End a video session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session ended' })
  async endRoom(@Param('id') id: string, @Body() dto: EndRoomDto) {
    const session = await this.roomsService.endRoom(id, dto.reason);
    return {
      sessionId: session.id,
      status: session.status,
      endedAt: session.endedAt,
    };
  }

  @Post(':id/cancel')
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a scheduled session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session cancelled' })
  async cancelSession(@Param('id') id: string) {
    const session = await this.roomsService.cancelSession(id);
    return {
      sessionId: session.id,
      status: session.status,
    };
  }

  @Get('claim/:claimId')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all sessions for a claim' })
  @ApiParam({ name: 'claimId', description: 'Claim ID' })
  async getSessionsForClaim(@Param('claimId') claimId: string) {
    const sessions = await this.roomsService.getSessionsForClaim(claimId);
    return sessions.map(s => ({
      sessionId: s.id,
      roomUrl: s.roomUrl,
      status: s.status,
      scheduledTime: s.scheduledTime,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    }));
  }

  @Get()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get all sessions' })
  async getAllSessions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string
  ) {
    const result = await this.roomsService.getAllSessions(page, limit, search);
    return {
      data: result.data.map(s => ({
        id: s.id,
        claimId: s.claimId,
        roomUrl: s.roomUrl,
        status: s.status,
        scheduledTime: s.scheduledTime,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds: s.durationSeconds,
        recordingUrl: s.recordingUrl,
        analysisStatus: s.analysisStatus,
        createdAt: s.createdAt,
        claim: s.claim,
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
      totalPages: result.totalPages,
    };
  }

  @Get('config/status')
  @ApiOperation({ summary: 'Check Daily.co configuration status' })
  getConfigStatus() {
    return {
      provider: 'daily.co',
      configured: this.dailyService.isReady(),
      domain: this.dailyService.getDomain() || null,
    };
  }

  @Get(':id/recordings')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get recordings for a session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  async getRecordings(@Param('id') id: string) {
    const recordings = await this.roomsService.getRecordings(id);
    return {
      success: true,
      data: recordings,
    };
  }

  @Get(':id/recording-link')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get latest recording link for a session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  async getRecordingLink(@Param('id') id: string) {
    const link = await this.roomsService.getRecordingLink(id);
    return {
      success: true,
      data: link,
    };
  }
}
