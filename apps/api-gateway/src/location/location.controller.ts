import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { LocationService } from './location.service';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { SkipTenantCheck } from '../auth/decorators/skip-tenant-check.decorator';

@ApiTags('location')
@Controller('location')
@UseGuards(TenantGuard)
@SkipTenantCheck()
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

  @Get('reverse')
  @ApiOperation({ summary: 'Reverse geocode coordinates to address' })
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lon', required: true, type: Number })
  @ApiResponse({ status: 200, description: 'Address details' })
  async reverse(@Query('lat') lat: number, @Query('lon') lon: number) {
    return this.locationService.reverseGeocode(lat, lon);
  }
}
