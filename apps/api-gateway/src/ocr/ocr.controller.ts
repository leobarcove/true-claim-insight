import { Controller, Post, Body, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { OcrService } from './ocr.service';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { CurrentTenant } from '../auth/decorators/current-tenant.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@ApiTags('OCR')
@Roles('ADJUSTER', 'FIRM_ADMIN', 'SUPPORT_DESK')
@Controller('ocr')
@UseGuards(TenantGuard)
@ApiBearerAuth('access-token')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('extract')
  @ApiOperation({ summary: 'Extract data from uploaded documents' })
  @ApiResponse({ status: 200, description: 'Successfully extracted data' })
  async extract(@Req() req: any) {
    if (!req.isMultipart()) {
      throw new HttpException('Request must be multipart/form-data', HttpStatus.BAD_REQUEST);
    }

    const files: { buffer: Buffer; mimetype: string; filename: string; fieldname: string }[] = [];
    let sessionId = 'tci-new-claim';

    const parts = req.parts();
    for await (const part of parts) {
      if (part.file) {
        const buffer = await part.toBuffer();
        files.push({
          buffer,
          mimetype: part.mimetype,
          filename: part.filename,
          fieldname: part.fieldname,
        });
      } else {
        if (part.fieldname === 'id') {
          sessionId = part.value;
        }
      }
    }

    if (files.length === 0) {
      throw new HttpException('No files uploaded', HttpStatus.BAD_REQUEST);
    }

    return await this.ocrService.extractData(files, sessionId);
  }
}
