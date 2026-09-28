import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FloodClaimsService } from './flood-claims.service';
import { CreateFloodClaimDto } from './dto/create-flood-claim.dto';
import { TenantGuard, TenantContext } from '../common/guards/tenant.guard';
import { Tenant } from '../common/decorators/tenant.decorator';
import { TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../common/guards/roles.guard';

@ApiTags('claims-flood')
@ApiBearerAuth()
@Controller({ path: 'claims/flood', version: '1' })
@UseGuards(TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class FloodClaimsController {
  constructor(private readonly service: FloodClaimsService) {}

  @Post()
  @Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new flood claim' })
  create(
    @Body() dto: CreateFloodClaimDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.create(dto, tenantContext);
  }

  @Get()
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.SIU_INVESTIGATOR,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SUPPORT_DESK,
    UserRole.SUPER_ADMIN
  )
  @ApiOperation({ summary: 'List flood claims for the current tenant' })
  findAll(@Tenant() tenantContext: TenantContext) {
    return this.service.findAll(tenantContext);
  }

  @Get(':id')
  @Roles(
    UserRole.ADJUSTER,
    UserRole.FIRM_ADMIN,
    UserRole.SIU_INVESTIGATOR,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.SUPPORT_DESK,
    UserRole.SUPER_ADMIN
  )
  @ApiOperation({ summary: 'Get a single flood claim (with sub-table)' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.findOne(id, tenantContext);
  }
}
