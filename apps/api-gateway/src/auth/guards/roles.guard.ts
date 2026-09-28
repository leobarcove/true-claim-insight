import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  AUTHENTICATED_KEY,
  DELEGATED_AUTHORISATION_KEY,
  INTERNAL_ROUTE_KEY,
} from '../decorators/access.decorator';

/**
 * Global authorisation guard — deny by default.
 *
 * Registered once as an APP_GUARD, after authentication, so no controller can
 * forget it. A route is reachable only when it declares a rule: `@Public()`,
 * `@InternalRoute()`, `@Authenticated()`, `@Roles(...)`, or
 * `@DelegatedAuthorisation(...)`. A route with none is refused and logged.
 * Until September 2026 the default was the opposite — a route without
 * `@Roles` admitted every signed-in user — which is how document downloads,
 * report actions and the retention sweep came to be open to every role
 * (OWASP A01:2025; BNM MCIPD 10.25).
 *
 * The role read here is the *effective* role — the membership's role in the
 * active tenant, resolved by the JWT strategy — never the user's global one.
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

    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }

    if (meta<boolean>(AUTHENTICATED_KEY)) {
      return true;
    }

    // Every rule below needs a role in the active tenant.
    if (!user.role) {
      return false;
    }

    const requiredRoles = meta<string[]>(ROLES_KEY);
    if (requiredRoles?.length) {
      return user.role === 'SUPER_ADMIN' || requiredRoles.includes(user.role);
    }

    if (meta<string>(DELEGATED_AUTHORISATION_KEY)) {
      return true;
    }

    this.logger.error(
      `Refused ${context.getClass().name}.${context.getHandler().name}: no access rule declared (deny by default)`
    );
    return false;
  }
}
