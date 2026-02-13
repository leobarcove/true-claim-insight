import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, JoinRoomDto, EndRoomDto, SaveClientInfoDto } from './dto/room.dto';
import { DailyService } from '../daily/daily.service';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { TenantIsolation, TenantScope, Tenant, SkipTenantCheck } from '../common/decorators/tenant.decorator';

@ApiTags('rooms')
@ApiBearerAuth('access-token')
@Controller('rooms')
@UseGuards(InternalAuthGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly dailyService: DailyService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new video room for a claim' })
  @ApiResponse({ status: 201, description: 'Room created successfully' })
  @ApiResponse({ status: 404, description: 'Claim not found' })
  async createRoom(@Body() dto: CreateRoomDto, @Tenant() tenantContext: TenantContext) {
    const { session, roomUrl } = await this.roomsService.createRoom(dto, tenantContext);
    return {
      sessionId: session.id,
      roomUrl,
      status: session.status,
      scheduledTime: session.scheduledTime,
      dailyConfigured: this.dailyService.isReady(),
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get room/session details' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Room details' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async getRoom(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    const s = await this.roomsService.getRoom(id, tenantContext);
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
        claimId: { type: 'string' },
      },
    },
  })
  async joinRoom(@Param('id') id: string, @Body() dto: JoinRoomDto, @Tenant() tenantContext: TenantContext) {
    console.log(`[RoomsController] Join attempt for session ${id}:`, JSON.stringify(dto));
    return this.roomsService.joinRoom(id, dto, tenantContext);
  }

  @Post(':id/end')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End a video session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session ended' })
  async endRoom(@Param('id') id: string, @Body() dto: EndRoomDto, @Tenant() tenantContext: TenantContext) {
    const session = await this.roomsService.endRoom(id, dto.reason, tenantContext);
    return {
      sessionId: session.id,
      status: session.status,
      endedAt: session.endedAt,
    };
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a scheduled session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  @ApiResponse({ status: 200, description: 'Session cancelled' })
  async cancelSession(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    const session = await this.roomsService.cancelSession(id, tenantContext);
    return {
      sessionId: session.id,
      status: session.status,
    };
  }

  @Get('claim/:claimId')
  @ApiOperation({ summary: 'Get all sessions for a claim' })
  @ApiParam({ name: 'claimId', description: 'Claim ID' })
  async getSessionsForClaim(@Param('claimId') claimId: string, @Tenant() tenantContext: TenantContext) {
    const sessions = await this.roomsService.getSessionsForClaim(claimId, tenantContext);
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
  @ApiOperation({ summary: 'Get all sessions' })
  async getAllSessions(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('search') search?: string,
    @Tenant() tenantContext?: TenantContext
  ) {
    const result = await this.roomsService.getAllSessions(page, limit, search, tenantContext);
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
  @SkipTenantCheck()
  @ApiOperation({ summary: 'Check Daily.co configuration status' })
  getConfigStatus() {
    return {
      provider: 'daily.co',
      configured: this.dailyService.isReady(),
      domain: this.dailyService.getDomain() || null,
    };
  }

  @Get(':id/recordings')
  @ApiOperation({ summary: 'Get recordings for a session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  async getRecordings(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    const recordings = await this.roomsService.getRecordings(id, tenantContext);
    return {
      success: true,
      data: recordings,
    };
  }

  @Get(':id/recording-link')
  @ApiOperation({ summary: 'Get latest recording link for a session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  async getRecordingLink(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    const link = await this.roomsService.getRecordingLink(id, tenantContext);
    return {
      success: true,
      data: link,
    };
  }

  @Post(':id/client-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Save client information for a session' })
  @ApiParam({ name: 'id', description: 'Session ID' })
  async saveClientInfo(
    @Param('id') id: string,
    @Body() dto: SaveClientInfoDto,
    @Req() req: FastifyRequest,
    @Tenant() tenantContext: TenantContext
  ) {
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || '';

    return this.roomsService.saveClientInfo(id, dto, clientIp, tenantContext);
  }
}
