import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

/**
 * Guard to validate tenant context in requests
 * Ensures user has access to the tenant they're trying to access
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private config: ConfigService
  ) {}

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
    const claimantHandlingTenant =
      user.role === 'CLAIMANT' && !headerTenantId && !user.currentTenantId && !user.tenantId
        ? this.config.get<string>('HANDLING_FIRM_TENANT_ID')
        : undefined;
    const currentTenantId =
      headerTenantId || user.currentTenantId || user.tenantId || claimantHandlingTenant;

    if (!currentTenantId && user.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('No tenant context available. Please select a tenant.');
    }

    // Validate user has access to this tenant
    // Check main tenantId or the list of accessible tenantIds from JWT
    const hasAccess =
      user.role === 'SUPER_ADMIN' ||
      user.tenantId === currentTenantId ||
      // A first-time claimant has no claim from which authentication can
      // derive an insurer tenant. Self-service intake is owned by the handling
      // firm configured for exactly that case. This is not a client-selected
      // tenant: the fallback is used only when the token and header name none.
      claimantHandlingTenant === currentTenantId ||
      (user.tenantIds && user.tenantIds.includes(currentTenantId));

    if (!hasAccess) {
      throw new ForbiddenException('You do not have access to the requested tenant context.');
    }

    // Add validated tenant context to request for easy access in controllers
    request.tenantContext = {
      tenantId: currentTenantId || user.role,
      userId: user.id || user.sub,
      userRole:
        user.role === 'SUPER_ADMIN' && currentTenantId && currentTenantId !== 'SUPER_ADMIN'
          ? 'FIRM_ADMIN'
          : user.role,
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
