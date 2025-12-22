import { Controller, Post, Body, Req, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { OcrService } from './ocr.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('OCR')
@Controller('ocr')
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Post('extract')
  // @UseGuards(JwtAuthGuard)
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
