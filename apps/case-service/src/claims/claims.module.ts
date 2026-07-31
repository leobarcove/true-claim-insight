import { Module } from '@nestjs/common';
import { ConsentModule } from '../consent/consent.module';
import { SlaModule } from '../sla/sla.module';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [SlaModule, ConsentModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
  exports: [ClaimsService],
})
export class ClaimsModule {}
