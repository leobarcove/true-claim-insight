import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

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

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    if (!user || !user.role) {
      return false;
    }

    if (user.role === UserRole.SUPER_ADMIN || user.role === 'SUPER_ADMIN') {
      return true;
    }

    return requiredRoles.some(role => user.role === role);
  }
}
