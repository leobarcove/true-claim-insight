import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { LocationService } from './location.service';

@ApiTags('location')
@Controller('location')
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  @Get('search')
  @ApiOperation({ summary: 'Search for accurate addresses' })
  @ApiQuery({
    name: 'q',
    required: true,
    description: 'Address query string',
    example: 'Bukit Bintang',
  })
  @ApiResponse({ status: 200, description: 'List of matching addresses' })
  async search(@Query('q') query: string) {
    return this.locationService.searchAddress(query);
  }
}
