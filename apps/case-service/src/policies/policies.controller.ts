import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PoliciesService } from './policies.service';
import { CreatePolicyDto } from './dto/create-policy.dto';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { RolesGuard, UserRole } from '../common/guards/roles.guard';
import { TenantGuard } from '../common/guards/tenant.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { TenantIsolation, TenantScope } from '../common/decorators/tenant.decorator';

@ApiTags('policies')
@ApiBearerAuth()
@Controller({ path: 'policies', version: '1' })
@UseGuards(InternalAuthGuard, RolesGuard, TenantGuard)
@TenantIsolation(TenantScope.STRICT)
@Roles(UserRole.ADJUSTER, UserRole.FIRM_ADMIN, UserRole.SUPER_ADMIN)
export class PoliciesController {
  constructor(private readonly service: PoliciesService) {}

  @Get()
  @ApiOperation({ summary: 'Search insurer policies (policy number / name / phone)' })
  search(@Query() query: { search?: string; page?: string; limit?: string }) {
    return this.service.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a policy by id' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Manually record a policy supplied by the insurer' })
  create(@Body() dto: CreatePolicyDto) {
    return this.service.create(dto);
  }
}
