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

@ApiTags('claims')
@ApiBearerAuth()
@Controller('claims')
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
  @ApiOperation({ summary: 'Get all claims with filters' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns paginated list of claims',
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'claimType', required: false, type: String })
  @ApiQuery({ name: 'adjusterId', required: false, type: String })
  async findAll(@Query() query: ClaimQueryDto) {
    return this.claimsService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a claim by ID' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the claim',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Claim not found',
  })
  async findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.claimsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a claim' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Claim updated successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Claim not found',
  })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateClaimDto: UpdateClaimDto,
  ) {
    return this.claimsService.update(id, updateClaimDto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update claim status' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Claim status updated successfully',
  })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: string,
  ) {
    return this.claimsService.updateStatus(id, status);
  }

  @Post(':id/assign')
  @ApiOperation({ summary: 'Assign an adjuster to a claim' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Adjuster assigned successfully',
  })
  async assignAdjuster(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() assignAdjusterDto: AssignAdjusterDto,
  ) {
    return this.claimsService.assignAdjuster(id, assignAdjusterDto.adjusterId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a claim (soft delete)' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Claim deleted successfully',
  })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.claimsService.remove(id);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get claim timeline/history' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns claim timeline',
  })
  async getTimeline(@Param('id', ParseUUIDPipe) id: string) {
    return this.claimsService.getTimeline(id);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add a note to a claim' })
  @ApiParam({ name: 'id', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Note added successfully',
  })
  async addNote(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('content') content: string,
    @Body('authorId') authorId: string,
  ) {
    return this.claimsService.addNote(id, content, authorId);
  }
}
