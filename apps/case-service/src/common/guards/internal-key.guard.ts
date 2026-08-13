import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';

/**
 * Proves the caller is api-gateway, and asserts nothing about who is using it.
 *
 * `InternalAuthGuard` additionally requires identity headers, because almost
 * every internal call is made *on behalf of* a signed-in user and a route that
 * accepted one without an identity would be a route with no access control.
 *
 * The public intake conversation is the exception, and it is a real one rather
 * than a convenience: a visitor who has not yet proved a phone number has no
 * identity to send. Their binding carries no `claimantId`, so it can reach no
 * claim, and the gateway's onboarding says nothing about any claim until a code
 * has been verified. Access control has not been skipped here — it has moved
 * into the conversation.
 *
 * Do not reach for this guard anywhere else. If a route can name the user it
 * is acting for, it should be using InternalAuthGuard.
 */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  private readonly logger = new Logger(InternalKeyGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const provided = request.headers['x-internal-key'];
    const expected = this.configService.get<string>('INTERNAL_API_KEY');

    // Fail closed on misconfiguration, exactly as InternalAuthGuard does: an
    // empty expected key must never mean "accept anything".
    if (!expected) {
      this.logger.error(
        'INTERNAL_API_KEY is not configured — refusing all internal requests.'
      );
      throw new ForbiddenException('Service not configured for internal requests');
    }

    if (typeof provided !== 'string' || provided.length !== expected.length) {
      throw new ForbiddenException('Invalid internal key');
    }

    if (!timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
      throw new ForbiddenException('Invalid internal key');
    }

    return true;
  }
}
