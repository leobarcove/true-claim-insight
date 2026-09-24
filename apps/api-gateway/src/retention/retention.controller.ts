import { Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ClaimantRetentionService } from './claimant-retention.service';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Manual trigger for the claimant anonymisation sweep.
 *
 * The nightly schedule is the real mechanism; this exists so a compliance
 * officer can demonstrate the control on request — a BNM examination under
 * FSA s.146 asks to see a control work, not to be told it runs at 04:00.
 */
@ApiTags('Retention')
@ApiBearerAuth()
@Roles('SUPER_ADMIN')
@Controller('retention/claimants')
export class RetentionController {
  constructor(private readonly retention: ClaimantRetentionService) {}

  @Post('sweep')
  @ApiOperation({ summary: 'Run the claimant anonymisation sweep now' })
  sweep() {
    return this.retention.sweep();
  }
}
