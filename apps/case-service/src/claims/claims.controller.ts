import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ClaimsService } from './claims.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimDto } from './dto/update-claim.dto';
import { ClaimQueryDto } from './dto/claim-query.dto';
import { AssignAdjusterDto } from './dto/assign-adjuster.dto';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { TenantIsolation, TenantScope, Tenant } from '../common/decorators/tenant.decorator';

/**
 * ClaimsController with multi-tenant isolation
 *
 * All endpoints are protected by TenantGuard which ensures:
 * 1. User has a valid tenantId in their JWT
 * 2. Queries are automatically filtered by tenant
 * 3. Cross-tenant access is prevented
 */
@ApiTags('claims')
@ApiBearerAuth()
@Controller('claims')
@UseGuards(TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class ClaimsController {
  constructor(private readonly claimsService: ClaimsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new claim' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Claim created successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  async create(@Body() createClaimDto: CreateClaimDto) {
    return this.claimsService.create(createClaimDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all claims with filters (tenant-scoped)' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns paginated list of claims for your organisation',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'claimType', required: false, type: String })
  @ApiQuery({ name: 'adjusterId', required: false, type: String })
  async findAll(
    @Query() query: ClaimQueryDto,
    @Tenant() tenantContext: TenantContext,
  ) {
    return this.claimsService.findAll(query, tenantContext);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a claim by ID (tenant-validated)' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the claim',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Claim not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Claim does not belong to your organisation',
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext,
  ) {
    return this.claimsService.findOne(id, tenantContext);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a claim (tenant-validated)' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Claim updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Claim not found',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Claim does not belong to your organisation',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClaimDto: UpdateClaimDto,
    @Tenant() tenantContext: TenantContext,
  ) {
    return this.claimsService.update(id, updateClaimDto, tenantContext);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update claim status (tenant-validated)' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Claim status updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Claim does not belong to your organisation',
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
    @Tenant() tenantContext: TenantContext,
  ) {
    return this.claimsService.updateStatus(id, status, tenantContext);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign an adjuster to a claim (same tenant only)' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Adjuster assigned successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Cannot assign adjuster from different organisation',
  })
  async assignAdjuster(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignAdjusterDto: AssignAdjusterDto,
    @Tenant() tenantContext: TenantContext,
  ) {
    return this.claimsService.assignAdjuster(
      id,
      assignAdjusterDto.adjusterId,
      tenantContext,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a claim (soft delete, tenant-validated)' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Claim deleted successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Claim does not belong to your organisation',
  })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext,
  ) {
    return this.claimsService.remove(id, tenantContext);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get claim timeline/history (tenant-validated)' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns claim timeline',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Claim does not belong to your organisation',
  })
  async getTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext,
  ) {
    return this.claimsService.getTimeline(id, tenantContext);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to a claim (tenant-validated)' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Note added successfully',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Claim does not belong to your organisation',
  })
  async addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('content') content: string,
    @Body('authorId') authorId: string,
    @Tenant() tenantContext: TenantContext,
  ) {
    return this.claimsService.addNote(id, content, authorId, tenantContext);
  }
}
