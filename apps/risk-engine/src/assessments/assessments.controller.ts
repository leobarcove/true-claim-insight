import { Controller, Get, Post, Body, Param, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse as SwaggerResponse } from '@nestjs/swagger';
import { AssessmentsService } from './assessments.service';

@ApiTags('Assessments')
@Controller('assessments')
export class AssessmentsController {
  private readonly logger = new Logger(AssessmentsController.name);

  constructor(private readonly assessmentsService: AssessmentsService) {}

  @Get('session/:sessionId')
  @ApiOperation({ summary: 'Get risk assessments for a video session' })
  @SwaggerResponse({ status: 200, description: 'List of risk assessments' })
  async getAssessments(@Param('sessionId') sessionId: string) {
    return this.assessmentsService.getAssessmentsBySession(sessionId);
  }

  @Post('trigger')
  @ApiOperation({ summary: 'Trigger a real-time risk assessment (Mock)' })
  @SwaggerResponse({ status: 201, description: 'Assessment triggered' })
  async triggerAssessment(
    @Body('sessionId') sessionId: string,
    @Body('assessmentType') assessmentType: string,
  ) {
    this.logger.log(`Triggering ${assessmentType} assessment for session ${sessionId}`);
    return this.assessmentsService.triggerMockAssessment(sessionId, assessmentType);
  }
}
