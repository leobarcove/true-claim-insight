import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { INTERNAL_ROUTE_KEY } from '../decorators/access.decorator';

/**
 * Global authentication guard. Registered once as an APP_GUARD, ahead of the
 * roles guard, so every route authenticates unless it is `@Public()` or an
 * `@InternalRoute()` (which authenticates with the internal key instead).
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const skip = [IS_PUBLIC_KEY, INTERNAL_ROUTE_KEY].some(key =>
      this.reflector.getAllAndOverride<boolean>(key, [context.getHandler(), context.getClass()])
    );

    if (skip) {
      return true;
    }

    return super.canActivate(context);
  }
}
