import { SetMetadata } from '@nestjs/common';

/**
 * Decorator to skip tenant validation for specific routes
 * Use for routes that don't require tenant context (e.g., login, register)
 */
export const SkipTenantCheck = () => SetMetadata('skipTenantCheck', true);
