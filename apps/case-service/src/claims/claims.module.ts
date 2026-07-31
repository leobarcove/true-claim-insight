import { Module } from '@nestjs/common';
import { ConsentModule } from '../consent/consent.module';
import { AdjustersModule } from '../adjusters/adjusters.module';
import { SlaModule } from '../sla/sla.module';
import { ClaimsController } from './claims.controller';
import { ClaimsService } from './claims.service';

@Module({
  imports: [SlaModule, ConsentModule, AdjustersModule],
  controllers: [ClaimsController],
  providers: [ClaimsService],
  exports: [ClaimsService],
})
export class ClaimsModule {}
