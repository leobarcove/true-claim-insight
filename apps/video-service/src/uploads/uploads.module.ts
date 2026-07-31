import { Module } from '@nestjs/common';
import { UploadsController } from './uploads.controller';
import { ConsentGateService } from '../common/consent/consent-gate.service';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController],
  providers: [UploadsService, ConsentGateService],
  exports: [UploadsService],
})
export class UploadsModule {}
