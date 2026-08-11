import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Guards the few gateway routes an internal service calls *inward*.
 *
 * The gateway is the edge, so traffic normally flows outward from it and this
 * guard has nothing to do. The exception is identity: `claimant` belongs to
 * the identity context and only this service may write it, so case-service has
 * to ask the gateway to resolve one — and that route must not be public, since
 * find-or-create on a bare phone number is a claimant-creation and enumeration
 * oracle.
 *
 * Fails CLOSED when the key is unconfigured: an unset secret means the inward
 * path is off, not open. Same posture as the guard in the three internal
 * services, and constant-time compared for the same reason.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('INTERNAL_API_KEY');
    if (!expected) {
      this.logger.error('INTERNAL_API_KEY is not set — refusing internal request.');
      throw new ForbiddenException('Service not configured for internal requests');
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, unknown> }>();
    const presented = request.headers['x-internal-key'];

    if (typeof presented !== 'string' || !constantTimeEqual(presented, expected)) {
      throw new ForbiddenException('Invalid internal credentials');
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
