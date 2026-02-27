import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    
    // In production, verify a shared secret or JWT from the internal gateway
    // For now, we'll allow requests that have the required tenant headers
    const tenantId = request.headers['x-tenant-id'];
    const userId = request.headers['x-user-id'];

    if (tenantId || userId) {
      return true;
    }

    // Also check for standard Bearer token if it's a direct browser call
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return true;
    }

    this.logger.warn(`Unauthorized internal request from ${request.ip}`);
    return false;
  }
}
