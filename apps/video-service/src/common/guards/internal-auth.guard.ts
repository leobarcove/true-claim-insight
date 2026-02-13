import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    const userId = request.headers['x-user-id'];
    const tenantId = request.headers['x-tenant-id'];
    const userRole = request.headers['x-user-role'];
    const authorization = request.headers['authorization'];

    if (userId && tenantId) {
      request.user = {
        sub: userId,
        tenantId: tenantId,
        role: userRole || 'ADJUSTER',
        internal: true,
      };

      this.logger.debug(`InternalAuthGuard: Trusting internal request for user ${userId}`);
      return true;
    }

    if (authorization) {
      return true;
    }

    this.logger.warn('InternalAuthGuard: No valid auth context found');
    return false;
  }
}
