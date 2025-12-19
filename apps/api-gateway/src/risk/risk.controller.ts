import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RiskService } from './risk.service';

@ApiTags('risk')
@Controller('risk')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('access-token')
export class RiskController {
  constructor(private readonly riskService: RiskService) {}

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get risk assessments for a session' })
  async getAssessments(@Param('sessionId') sessionId: string) {
    try {
      return await this.riskService.getAssessments(sessionId);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }

  @Post('trigger')
  @Roles('ADJUSTER', 'ADMIN')
  @ApiOperation({ summary: 'Trigger a real-time risk assessment' })
  async triggerAssessment(
    @Body('sessionId') sessionId: string,
    @Body('assessmentType') assessmentType: string,
  ) {
    try {
      return await this.riskService.triggerAssessment(sessionId, assessmentType);
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_GATEWAY);
    }
  }
}
