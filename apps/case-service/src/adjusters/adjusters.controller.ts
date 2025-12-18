import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { AdjustersService } from './adjusters.service';

@ApiTags('adjusters')
@ApiBearerAuth()
@Controller('adjusters')
export class AdjustersController {
  constructor(private readonly adjustersService: AdjustersService) {}

  @Get(':id/queue')
  @ApiOperation({ summary: 'Get adjuster case queue' })
  @ApiParam({ name: 'id', description: 'Adjuster UUID' })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns adjuster queue',
  })
  async getQueue(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('status') status?: string,
  ) {
    return this.adjustersService.getQueue(id, status);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get adjuster statistics' })
  @ApiParam({ name: 'id', description: 'Adjuster UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns adjuster stats',
  })
  async getStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.adjustersService.getStats(id);
  }

  @Get(':id/workload')
  @ApiOperation({ summary: 'Get adjuster workload for assignment' })
  @ApiParam({ name: 'id', description: 'Adjuster UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns adjuster workload info',
  })
  async getWorkload(@Param('id', ParseUUIDPipe) id: string) {
    return this.adjustersService.getWorkload(id);
  }

  @Get('available')
  @ApiOperation({ summary: 'Get available adjusters for assignment' })
  @ApiQuery({ name: 'tenantId', required: true, type: String })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns list of available adjusters',
  })
  async getAvailableAdjusters(@Query('tenantId') tenantId: string) {
    return this.adjustersService.getAvailableAdjusters(tenantId);
  }
}
