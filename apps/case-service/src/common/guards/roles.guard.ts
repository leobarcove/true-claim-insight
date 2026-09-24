import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { INTERNAL_ROUTE_KEY } from '../decorators/access.decorator';

export enum UserRole {
  CLAIMANT = 'CLAIMANT',
  ADJUSTER = 'ADJUSTER',
  FIRM_ADMIN = 'FIRM_ADMIN',
  SIU_INVESTIGATOR = 'SIU_INVESTIGATOR',
  COMPLIANCE_OFFICER = 'COMPLIANCE_OFFICER',
  SUPPORT_DESK = 'SUPPORT_DESK',
  SHARIAH_REVIEWER = 'SHARIAH_REVIEWER',
  SUPER_ADMIN = 'SUPER_ADMIN',
}

/**
 * Global authorisation guard — deny by default.
 *
 * Registered once as an APP_GUARD after `InternalAuthGuard`. A route is
 * reachable only when it declares `@Roles(...)`, `@Public()` or
 * `@InternalRoute()`; a route declaring nothing is refused and logged. Until
 * September 2026 a route without `@Roles` admitted every role — reports,
 * documents and flood claims among them (OWASP A01:2025, BNM MCIPD 10.25).
 *
 * The role is the caller's membership role in the active tenant, resolved at
 * the gateway and forwarded as X-User-Role.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = <T>(key: string) =>
      this.reflector.getAllAndOverride<T>(key, [context.getHandler(), context.getClass()]);

    if (meta<boolean>(IS_PUBLIC_KEY) || meta<boolean>(INTERNAL_ROUTE_KEY)) {
      return true;
    }

    const requiredRoles = meta<UserRole[]>(ROLES_KEY);
    if (!requiredRoles?.length) {
      this.logger.error(
        `Refused ${context.getClass().name}.${context.getHandler().name}: no access rule declared (deny by default)`
      );
      return false;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      return false;
    }

    if (user.role === UserRole.SUPER_ADMIN) {
      return true;
    }

    return requiredRoles.some(role => user.role === role);
  }
}
