import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';

/**
 * InternalAuthGuard for trusting requests from API Gateway.
 *
 * When the API Gateway proxies requests, it has already validated the JWT.
 * This guard reads the user context from trusted headers (X-User-Id, X-Tenant-Id)
 * and populates request.user for downstream guards like TenantGuard.
 *
 * SECURITY NOTE: This should only be used for internal service-to-service calls.
 * In production, add an internal API key or mutual TLS for verification.
 */
@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Check for internal headers from API Gateway
    const userId = request.headers['x-user-id'];
    const tenantId = request.headers['x-tenant-id'];
    const userRole = request.headers['x-user-role'];
    const authorization = request.headers['authorization'];

    // If we have internal headers, trust them and populate user
    if (userId && tenantId) {
      request.user = {
        sub: userId,
        tenantId: tenantId,
        role: userRole || 'ADJUSTER', // Use provided role or default to ADJUSTER
        internal: true,
      };

      this.logger.debug(`InternalAuthGuard: Trusting internal request for user ${userId}`);
      return true;
    }

    // If no internal headers but has authorization, let JwtAuthGuard handle it
    if (authorization) {
      return true;
    }

    this.logger.warn('InternalAuthGuard: No valid auth context found');
    return false;
  }
}
