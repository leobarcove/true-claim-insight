import { Controller, Get, Post, Patch, Body, Param, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { catchError, map } from 'rxjs/operators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';


@ApiTags('Claims')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('claims')
export class ClaimsController {
  private caseServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.caseServiceUrl = this.configService.get('CASE_SERVICE_URL') || 'http://localhost:3001';
  }

  @Post()
  @ApiOperation({ summary: 'Create a new claim' })
  create(@Body() createClaimDto: any, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.user?.tenantId,
      'X-User-Id': req.user?.id,
    };

    // case-service has /api/v1 prefix
    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/claims`, createClaimDto, { headers })
      .pipe(
        map((response) => response.data.data), // Extract .data.data to avoid double wrapping
        catchError((e) => {
          throw new HttpException(
            e.response?.data || 'Failed to create claim',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }),
      );
  }

  @Get()
  @ApiOperation({ summary: 'Get all claims for the user/tenant' })
  findAll(@Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.user?.tenantId,
      'X-User-Id': req.user?.id,
    };

    // case-service has /api/v1 prefix
    return this.httpService
      .get(`${this.caseServiceUrl}/api/v1/claims`, { 
        headers,
        params: req.query, // Pass query parameters (search, status, etc.)
      })
      .pipe(
        map((response) => response.data.data), // Extract .data.data to avoid double wrapping
        catchError((e) => {
          throw new HttpException(
            e.response?.data || 'Failed to fetch claims',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }),
      );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a claim by ID' })
  findOne(@Param('id') id: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.user?.tenantId,
      'X-User-Id': req.user?.id,
    };

    return this.httpService
      .get(`${this.caseServiceUrl}/api/v1/claims/${id}`, { headers })
      .pipe(
        map((response) => response.data.data),
        catchError((e) => {
          throw new HttpException(
            e.response?.data || 'Failed to fetch claim',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }),
      );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a claim' })
  update(@Param('id') id: string, @Body() updateClaimDto: any, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.user?.tenantId,
      'X-User-Id': req.user?.id,
    };

    return this.httpService
      .patch(`${this.caseServiceUrl}/api/v1/claims/${id}`, updateClaimDto, { headers })
      .pipe(
        map((response) => response.data.data),
        catchError((e) => {
          throw new HttpException(
            e.response?.data || 'Failed to update claim',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }),
      );
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update claim status' })
  updateStatus(@Param('id') id: string, @Body('status') status: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.user?.tenantId,
      'X-User-Id': req.user?.id,
    };

    return this.httpService
      .patch(`${this.caseServiceUrl}/api/v1/claims/${id}/status`, { status }, { headers })
      .pipe(
        map((response) => response.data.data),
        catchError((e) => {
          throw new HttpException(
            e.response?.data || 'Failed to update claim status',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }),
      );
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign an adjuster' })
  assignAdjuster(@Param('id') id: string, @Body() assignAdjusterDto: any, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.user?.tenantId,
      'X-User-Id': req.user?.id,
    };

    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/claims/${id}/assign`, assignAdjusterDto, { headers })
      .pipe(
        map((response) => response.data.data),
        catchError((e) => {
          throw new HttpException(
            e.response?.data || 'Failed to assign adjuster',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }),
      );
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get claim timeline' })
  getTimeline(@Param('id') id: string, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.user?.tenantId,
      'X-User-Id': req.user?.id,
    };

    return this.httpService
      .get(`${this.caseServiceUrl}/api/v1/claims/${id}/timeline`, { headers })
      .pipe(
        map((response) => response.data.data),
        catchError((e) => {
          throw new HttpException(
            e.response?.data || 'Failed to fetch timeline',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }),
      );
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to a claim' })
  addNote(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    const headers = {
      Authorization: req.headers.authorization,
      'X-Tenant-Id': req.user?.tenantId,
      'X-User-Id': req.user?.id,
    };

    return this.httpService
      .post(`${this.caseServiceUrl}/api/v1/claims/${id}/notes`, body, { headers })
      .pipe(
        map((response) => response.data.data),
        catchError((e) => {
          throw new HttpException(
            e.response?.data || 'Failed to add note',
            e.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }),
      );
  }
}
