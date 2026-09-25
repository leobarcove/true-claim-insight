import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extract the current user from the request
 * (authentication is global; `@Public()` routes have no user)
 */
export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
