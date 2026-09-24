import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { AuthService, JwtPayload } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        (request: any) => request?.query?.token || null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret') || 'fallback-secret',
      passReqToCallback: true,
    });
  }

  /**
   * The request is passed in so the role is resolved for the tenant the
   * request names (`X-Tenant-Id`), not only the one the token was issued for.
   */
  async validate(request: any, payload: JwtPayload) {
    const requestedTenantId = request?.headers?.['x-tenant-id'];
    const user = await this.authService.validateJwtPayload(
      payload,
      typeof requestedTenantId === 'string' ? requestedTenantId : undefined
    );

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    return user;
  }
}
