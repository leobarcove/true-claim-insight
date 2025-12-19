import { Controller, Post, Body, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';

interface DailyWebhookPayload {
  type: string;
  event: string;
  session_id?: string;
  room_name?: string;
  recording_id?: string;
  download_link?: string;
  duration?: number;
  s3_key?: string;
}

@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('daily')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Handle Daily.co webhook events' })
  async handleDailyWebhook(
    @Body() payload: DailyWebhookPayload,
  ) {
    this.logger.log(`Received Daily webhook: ${payload.type || payload.event}`);
    
    // Handle different event types
    switch (payload.event || payload.type) {
      case 'recording.ready-to-download':
      case 'recording.ready':
        this.logger.log(`Recording ready for room: ${payload.room_name}`);
        await this.webhooksService.handleRecordingReady(payload);
        break;
        
      case 'meeting.ended':
        this.logger.log(`Meeting ended for room: ${payload.room_name}`);
        await this.webhooksService.handleMeetingEnded(payload);
        break;
        
      default:
        this.logger.debug(`Unhandled event type: ${payload.event || payload.type}`);
    }
    
    return { received: true };
  }

  // Endpoint to manually trigger analysis (for testing)
  @Post('trigger-analysis/:sessionId')
  @ApiOperation({ summary: 'Manually trigger analysis for a session (dev only)' })
  async triggerAnalysis(@Body() body: { sessionId: string }) {
    this.logger.log(`Manually triggering analysis for session: ${body.sessionId}`);
    await this.webhooksService.triggerAnalysisForSession(body.sessionId);
    return { triggered: true, sessionId: body.sessionId };
  }
}
