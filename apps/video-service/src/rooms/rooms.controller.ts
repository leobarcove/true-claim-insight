import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { CreateRoomDto, JoinRoomDto, EndRoomDto } from './dto/room.dto';
import { DailyService } from '../daily/daily.service';

@ApiTags('rooms')
@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly roomsService: RoomsService,
    private readonly dailyService: DailyService,
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
    const session = await this.roomsService.getRoom(id);
    return {
      sessionId: session.id,
      roomUrl: session.roomUrl,
      claimId: session.claimId,
      status: session.status,
      scheduledTime: session.scheduledTime,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      recordingUrl: session.recordingUrl,
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
    return sessions.map((s) => ({
      sessionId: s.id,
      roomUrl: s.roomUrl,
      status: s.status,
      scheduledTime: s.scheduledTime,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
    }));
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
}
