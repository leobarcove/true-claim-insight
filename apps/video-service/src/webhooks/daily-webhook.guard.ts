import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Guards the Daily.co webhook ingress.
 *
 * Daily cannot carry the platform's internal key, so the webhook URL carries a
 * shared secret instead: register the webhook with Daily as
 * `https://…/webhooks/daily?token=<DAILY_WEBHOOK_SECRET>` (a header
 * `x-webhook-token` is also accepted). Fails CLOSED when the secret is
 * unconfigured — an unauthenticated route into the analysis pipeline is the
 * §4.3 A1 defect wearing a webhook costume, and this controller shipped with
 * no guard at all (found by the 10 Aug 2026 audit; it was inert only because
 * the outbound call happened to omit the internal key).
 */
@Injectable()
export class DailyWebhookGuard implements CanActivate {
  private readonly logger = new Logger(DailyWebhookGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const secret = this.config.get<string>('DAILY_WEBHOOK_SECRET');
    if (!secret) {
      // No secret means webhook ingress is off, not open.
      this.logger.warn('DAILY_WEBHOOK_SECRET is not set — refusing webhook delivery.');
      throw new ForbiddenException('Webhook ingress is not configured');
    }

    const request = context
      .switchToHttp()
      .getRequest<{ query?: Record<string, unknown>; headers: Record<string, unknown> }>();
    const presented =
      (request.query?.token as string | undefined) ??
      (request.headers['x-webhook-token'] as string | undefined);

    if (!presented || !constantTimeEqual(presented, secret)) {
      throw new ForbiddenException('Invalid webhook credentials');
    }
    return true;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
