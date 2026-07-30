import { Module } from '@nestjs/common';
// Plain HttpModule on purpose: this module calls THIRD-PARTY hosts
// (OpenStreetMap / external OCR webhook). It must never carry the
// internal service key — see common/internal-http.module.ts.
import { HttpModule } from '@nestjs/axios';
import { LocationController } from './location.controller';
import { LocationService } from './location.service';

@Module({
  imports: [HttpModule],
  controllers: [LocationController],
  providers: [LocationService],
  exports: [LocationService],
})
export class LocationModule {}
