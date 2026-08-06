import { Module } from '@nestjs/common';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';
import { DocumentValidationService } from './document-validation.service';
import { FlowsService } from './flows.service';
import { StorageService } from '../common/services/storage.service';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  controllers: [CasesController],
  providers: [CasesService, DocumentValidationService, FlowsService, StorageService],
  exports: [CasesService, FlowsService],
})
export class CasesModule {}
