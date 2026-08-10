import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Tenant, TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantContext, TenantGuard } from '../common/guards/tenant.guard';
import { ClaimArchiveService } from './claim-archive.service';
import { ClaimExportService } from './claim-export.service';

@ApiTags('claim-export')
@Controller({ path: 'claims', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class ClaimExportController {
  constructor(
    private readonly service: ClaimExportService,
    private readonly archive: ClaimArchiveService
  ) {}

  @Get(':id/export')
  @ApiOperation({
    summary: 'Complete claim file (FSA s.143) — compliance roles only, hash-sealed and audited',
  })
  // Producing the full file — decrypted NRIC included — is a regulator-facing
  // act, not day-to-day claims handling.
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  export(@Param('id') id: string, @Tenant() tenantContext: TenantContext) {
    return this.service.exportClaimFile(id, tenantContext);
  }

  @Get(':id/export/archive')
  @ApiOperation({
    summary: 'Claim file as a ZIP: sealed bundle + document binaries + report PDFs',
  })
  @Roles(UserRole.COMPLIANCE_OFFICER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  async exportArchive(
    @Param('id') id: string,
    @Tenant() tenantContext: TenantContext,
    @Res() reply: FastifyReply
  ) {
    const result = await this.archive.exportArchive(id, tenantContext);

    return reply
      .header('Content-Type', 'application/zip')
      .header('Content-Disposition', `attachment; filename="${result.filename}"`)
      .header('X-Bundle-Sha256', result.bundleSha256)
      .send(result.archive);
  }
}
