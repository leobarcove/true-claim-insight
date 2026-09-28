import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { INTERNAL_ROUTE_KEY } from '../decorators/access.decorator';

/**
 * Authenticates internal (gateway → service) requests.
 *
 * The gateway validates the caller's JWT and forwards their identity as
 * X-User-Id / X-Tenant-Id / X-User-Role. Those headers are trusted downstream,
 * so they are only honoured when accompanied by the shared internal key — the
 * proof that the request actually came from the gateway.
 *
 * Without that proof, anyone able to reach this service's port could set the
 * headers themselves and act as any user of any tenant, bypassing every role
 * check, redaction rule and tenant filter in the platform. See
 * docs/MASTER_PLAN.md §4.3 A1.
 *
 * Shared secret is adequate for services on a private network under one
 * operator; migrate to mTLS when deployment artefacts exist (§4.3 A5).
 *
 * Registered globally (APP_GUARD) ahead of the roles guard, so no controller
 * can omit it. `@Public()` routes skip it, and `@InternalRoute()` routes —
 * service calls made on behalf of no person — use `InternalKeyGuard` instead.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly reflector: Reflector
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const skip = [IS_PUBLIC_KEY, INTERNAL_ROUTE_KEY].some(key =>
      this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()])
    );
    if (skip) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    const userId = request.headers['x-user-id'];
    const tenantId = request.headers['x-tenant-id'];
    const userRole = request.headers['x-user-role'];
    const providedKey = request.headers['x-internal-key'];

    const expectedKey = this.configService.get<string>('INTERNAL_API_KEY');

    // Fail closed on misconfiguration: an empty expected key must never mean
    // "accept anything".
    if (!expectedKey) {
      this.logger.error(
        'INTERNAL_API_KEY is not configured — refusing all internal requests. Set it in the environment for both the gateway and this service.'
      );
      throw new ForbiddenException('Service not configured for internal requests');
    }

    if (!userId) {
      this.logger.warn('Internal request without an identity header');
      throw new ForbiddenException('Missing internal identity');
    }

    if (providedKey !== expectedKey) {
      this.logger.warn(
        `Rejected internal request for user ${userId}: missing or invalid internal key`
      );
      throw new ForbiddenException('Invalid internal credentials');
    }

    if (!tenantId && userRole !== 'SUPER_ADMIN') {
      this.logger.warn(`Internal request for user ${userId} has no tenant context`);
      throw new ForbiddenException('Missing tenant context');
    }

    request.user = {
      sub: userId,
      tenantId: tenantId || userRole,
      // No role header means no role — never a default one. This once read
      // `|| 'ADJUSTER'`, which turned a missing header into adjuster access.
      role: userRole || null,
      internal: true,
    };

    return true;
  }
}
