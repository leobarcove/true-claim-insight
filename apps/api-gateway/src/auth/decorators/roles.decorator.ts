import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restrict access to specific roles
 * @param roles - Array of allowed roles
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
