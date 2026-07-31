import { Module } from '@nestjs/common';
import { StorageService } from '../common/services/storage.service';
import { CryptoModule } from '../common/crypto/crypto.module';
import { ReportsModule } from '../reports/reports.module';
import { ClaimArchiveService } from './claim-archive.service';
import { PrismaModule } from '../config/prisma.module';
import { ClaimExportController } from './claim-export.controller';
import { ClaimExportService } from './claim-export.service';

@Module({
  imports: [PrismaModule, CryptoModule, ReportsModule],
  controllers: [ClaimExportController],
  providers: [ClaimExportService, ClaimArchiveService, StorageService],
})
export class ExportModule {}
