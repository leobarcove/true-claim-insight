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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { DocumentsService } from './documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';

@ApiTags('documents')
@ApiBearerAuth()
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
  ) {
    return this.documentsService.create(claimId, createDocumentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all documents for a claim' })
  @ApiParam({ name: 'claimId', description: 'Claim UUID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Returns list of documents',
  })
  async findAll(@Param('claimId', ParseUUIDPipe) claimId: string) {
    return this.documentsService.findAll(claimId);
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
  ) {
    return this.documentsService.findOne(claimId, id);
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
  ) {
    return this.documentsService.getDownloadUrl(claimId, id);
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
  ) {
    return this.documentsService.remove(claimId, id);
  }
}
