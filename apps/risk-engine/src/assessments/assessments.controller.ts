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
  @ApiOperation({ summary: 'Trigger a mock risk assessment' })
  @SwaggerResponse({ status: 201, description: 'Assessment triggered' })
  async triggerAssessment(
    @Body('sessionId') sessionId: string,
    @Body('assessmentType') assessmentType: string,
  ) {
    this.logger.log(`Triggering ${assessmentType} assessment for session ${sessionId}`);
    return this.assessmentsService.triggerMockAssessment(sessionId, assessmentType);
  }

  @Get('analyzer-health')
  @ApiOperation({ summary: 'Check if Python analyzer service is healthy' })
  @SwaggerResponse({ status: 200, description: 'Analyzer health status' })
  async getAnalyzerHealth() {
    const isHealthy = await this.assessmentsService.isAnalyzerHealthy();
    return {
      service: 'risk-analyzer',
      status: isHealthy ? 'healthy' : 'unhealthy',
      url: 'http://localhost:3005',
    };
  }
}
