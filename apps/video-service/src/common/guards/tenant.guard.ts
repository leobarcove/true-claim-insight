import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TENANT_KEY, TenantScope } from '../decorators/tenant.decorator';

/**
 * TenantGuard ensures tenant isolation for multi-tenant operations.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const tenantConfig = this.reflector.getAllAndOverride<{
      scope: TenantScope;
      allowCrossTenant?: boolean;
    }>(TENANT_KEY, [context.getHandler(), context.getClass()]);

    if (!tenantConfig || tenantConfig.scope === TenantScope.NONE) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      this.logger.warn('TenantGuard: No user found in request');
      throw new ForbiddenException('Authentication required for tenant-scoped operations');
    }

    if (!user.tenantId) {
      this.logger.warn(`TenantGuard: User ${user.sub} has no tenantId`);
      throw new ForbiddenException('User is not associated with any tenant');
    }

    request.tenantContext = {
      tenantId: user.tenantId,
      userId: user.sub,
      userRole: user.role,
      scope: tenantConfig.scope,
      allowCrossTenant: tenantConfig.allowCrossTenant || false,
    };

    return true;
  }
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  userRole: string;
  scope: TenantScope;
  allowCrossTenant: boolean;
}

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}
