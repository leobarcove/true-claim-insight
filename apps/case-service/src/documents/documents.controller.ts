import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseUUIDPipe,
  HttpStatus,
  HttpCode,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { DocumentType } from '@prisma/client';

@ApiTags('documents')
@ApiBearerAuth()
@ApiBearerAuth()
@UseGuards(InternalAuthGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
@Controller('claims/:claimId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @ApiOperation({ summary: 'Add a document to a claim' })
  @ApiParam({ name: 'claimId', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Document added successfully',
  })
  async create(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Body() createDocumentDto: CreateDocumentDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.documentsService.create(claimId, createDocumentDto, tenantContext);
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a document file' })
  @ApiParam({ name: 'claimId', description: 'Claim UUID' })
  async upload(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Req() req: any,
    @Tenant() tenantContext: TenantContext
  ) {
    const file = await req.file();
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Extract additional fields from form data if needed
    const type = file.fields?.type?.value || DocumentType.OTHER_DOCUMENT;

    return this.documentsService.upload(claimId, file, type, tenantContext);
  }

  @Post(':id/replace')
  @ApiOperation({ summary: 'Replace an existing document' })
  @ApiParam({ name: 'claimId', description: 'Claim UUID' })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  async replace(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: any,
    @Tenant() tenantContext: TenantContext
  ) {
    const file = await req.file();
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.documentsService.replace(claimId, id, file, tenantContext);
  }

  @Get()
  @ApiOperation({ summary: 'Get all documents for a claim' })
  @ApiParam({ name: 'claimId', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns list of documents',
  })
  async findAll(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.documentsService.findAll(claimId, tenantContext);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document by ID' })
  @ApiParam({ name: 'claimId', description: 'Claim UUID' })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns the document',
  })
  async findOne(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.documentsService.findOne(claimId, id, tenantContext);
  }

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Get presigned download URL for a document' })
  @ApiParam({ name: 'claimId', description: 'Claim UUID' })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns presigned URL',
  })
  async getDownloadUrl(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.documentsService.getDownloadUrl(claimId, id, tenantContext);
  }

  @Post('trinity-check')
  @ApiOperation({ summary: 'Trigger Trinity AI checks for all documents in a claim' })
  @ApiParam({ name: 'claimId', description: 'Claim UUID' })
  async triggerTrinityCheck(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.documentsService.triggerTrinityCheck(claimId, tenantContext);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document' })
  @ApiParam({ name: 'claimId', description: 'Claim UUID' })
  @ApiParam({ name: 'id', description: 'Document UUID' })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: 'Document deleted successfully',
  })
  async remove(
    @Param('claimId', ParseUUIDPipe) claimId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.documentsService.remove(claimId, id, tenantContext);
  }
}
