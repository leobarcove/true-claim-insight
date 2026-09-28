import { SetMetadata } from '@nestjs/common';

export const INTERNAL_ROUTE_KEY = 'internalRoute';

/**
 * Called by another service with the shared internal key, but on behalf of no
 * signed-in person — so there is no identity for the roles guard to check.
 * The route must apply `InternalKeyGuard`; the access-rules coverage test
 * asserts that it does.
 *
 * Every other route declares `@Roles(...)` or `@Public()`: the roles guard is
 * global and denies any route that declares nothing.
 */
export const InternalRoute = () => SetMetadata(INTERNAL_ROUTE_KEY, true);
