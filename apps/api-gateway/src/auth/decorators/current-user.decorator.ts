import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extract the current user from the request
 * Use with @UseGuards(JwtAuthGuard)
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
