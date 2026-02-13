import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * Guard to validate tenant context in requests
 * Ensures user has access to the tenant they're trying to access
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as not requiring tenant validation
    const skipTenantCheck = this.reflector.get<boolean>('skipTenantCheck', context.getHandler());
    if (skipTenantCheck) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return true; // Let auth guard handle authentication
    }

    // Get tenant ID from header or user object
    const headerTenantId = request.headers['x-tenant-id'];
    const currentTenantId = headerTenantId || user.currentTenantId || user.tenantId;

    if (!currentTenantId) {
      throw new ForbiddenException('No tenant context available. Please select a tenant.');
    }

    // Validate user has access to this tenant
    // Check main tenantId or the list of accessible tenantIds from JWT
    const hasAccess =
      user.tenantId === currentTenantId ||
      (user.tenantIds && user.tenantIds.includes(currentTenantId));

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to the requested tenant context.');
    }

    // Add validated tenant context to request for easy access in controllers
    request.tenantContext = {
      tenantId: currentTenantId,
      userId: user.id || user.sub,
      userRole: user.role,
    };

    return true;
  }
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  userRole: string;
}

declare global {
  namespace Express {
    interface Request {
      tenantContext?: TenantContext;
    }
  }
}
