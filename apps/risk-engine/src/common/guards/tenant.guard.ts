import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TENANT_KEY, TenantScope } from '../decorators/tenant.decorator';

export interface TenantContext {
  tenantId: string;
  userId: string;
  userRole?: string;
  isInternal?: boolean;
}

@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const isolation = this.reflector.get<{ scope: TenantScope; allowCrossTenant?: boolean }>(
      TENANT_KEY,
      context.getHandler(),
    ) || this.reflector.get<{ scope: TenantScope; allowCrossTenant?: boolean }>(
      TENANT_KEY,
      context.getClass(),
    );

    if (isolation?.scope === TenantScope.NONE) {
      return true;
    }

    // Extract tenant information from headers (internal) or JWT (external)
    const tenantId = request.headers['x-tenant-id'];
    const userId = request.headers['x-user-id'];
    const userRole = request.headers['x-user-role'];

    if (tenantId && userId) {
      request.tenantContext = {
        tenantId,
        userId,
        userRole,
        isInternal: true,
      } as TenantContext;
      return true;
    }

    // Fallback to JWT decoding if headers are missing
    const authHeader = request.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        
        request.tenantContext = {
          tenantId: payload.tenantId || payload.orgId,
          userId: payload.sub || payload.userId,
          userRole: payload.role,
          isInternal: false,
        } as TenantContext;
        
        return true;
      } catch (e) {
        this.logger.error('Failed to decode JWT for tenant context');
      }
    }

    if (isolation?.scope === TenantScope.STRICT) {
      this.logger.warn(`STRICT tenant isolation violation at ${request.url}`);
      throw new ForbiddenException('Tenant context required');
    }

    return true;
  }
}
