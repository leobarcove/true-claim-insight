import { Module } from '@nestjs/common';
// Plain HttpModule on purpose: this module calls THIRD-PARTY hosts
// (OpenStreetMap / external OCR webhook). It must never carry the
// internal service key — see common/internal-http.module.ts.
import { HttpModule } from '@nestjs/axios';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';

@Module({
  imports: [HttpModule],
  controllers: [OcrController],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
