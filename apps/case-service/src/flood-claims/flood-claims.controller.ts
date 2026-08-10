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
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { Tenant } from '../common/decorators/tenant.decorator';
import { TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';

@ApiTags('claims-flood')
@ApiBearerAuth()
@Controller({ path: 'claims/flood', version: '1' })
@UseGuards(InternalAuthGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
export class FloodClaimsController {
  constructor(private readonly service: FloodClaimsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new flood claim' })
  create(
    @Body() dto: CreateFloodClaimDto,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.create(dto, tenantContext);
  }

  @Get()
  @ApiOperation({ summary: 'List flood claims for the current tenant' })
  findAll(@Tenant() tenantContext: TenantContext) {
    return this.service.findAll(tenantContext);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single flood claim (with sub-table)' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Tenant() tenantContext: TenantContext
  ) {
    return this.service.findOne(id, tenantContext);
  }
}
