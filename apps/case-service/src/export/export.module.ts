import { Module } from '@nestjs/common';
import { CryptoModule } from '../common/crypto/crypto.module';
import { PrismaModule } from '../config/prisma.module';
import { ClaimExportController } from './claim-export.controller';
import { ClaimExportService } from './claim-export.service';

@Module({
  imports: [PrismaModule, CryptoModule],
  controllers: [ClaimExportController],
  providers: [ClaimExportService],
})
export class ExportModule {}
