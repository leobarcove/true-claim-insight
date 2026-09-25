import { SetMetadata } from '@nestjs/common';

/**
 * Access rules other than `@Roles(...)` and `@Public()`.
 *
 * The roles guard denies any route that declares no rule (OWASP A01:2025,
 * "deny by default"), so every route states one of these. A forgotten
 * decorator now closes a route instead of silently opening it, and the
 * coverage test in `access-rules.spec.ts` fails the build before that ships.
 */

export const AUTHENTICATED_KEY = 'authenticatedOnly';

/**
 * Any signed-in identity, holding a role in the active tenant or not: reading
 * your own profile, switching tenant, changing your password. Nothing that
 * touches another person's data belongs here.
 */
export const Authenticated = () => SetMetadata(AUTHENTICATED_KEY, true);

export const INTERNAL_ROUTE_KEY = 'internalRoute';

/**
 * Called by another service, not by a person. No JWT is expected; the route
 * must apply `InternalAuthGuard`, which checks the shared internal key — the
 * coverage test asserts that it does.
 */
export const InternalRoute = () => SetMetadata(INTERNAL_ROUTE_KEY, true);

export const DELEGATED_AUTHORISATION_KEY = 'delegatedAuthorisation';

/** Services that authorise the routes the gateway only forwards to them. */
export type AuthorisingService = 'case-service';

/**
 * The gateway authenticates and forwards; the named service authorises, and
 * denies by default itself. Declared rather than implied, so "who decides" is
 * readable from the route — and so a proxy route is never mistaken for one the
 * gateway forgot to protect. Only the caller's *role* is delegated: the
 * caller must still hold a role in the active tenant to be forwarded at all.
 */
export const DelegatedAuthorisation = (service: AuthorisingService) =>
  SetMetadata(DELEGATED_AUTHORISATION_KEY, service);
