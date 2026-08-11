import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OtpService } from './otp.service';
import { OTP_TRANSPORT } from './otp-transport.interface';
import { ConsoleOtpTransport } from './console-otp.transport';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { UsersModule } from '../users/users.module';
import { ClaimantsModule } from '../claimants/claimants.module';

@Module({
  imports: [
    UsersModule,
    ClaimantsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret') || 'fallback-secret',
        signOptions: {
          expiresIn: 900, // 15 minutes in seconds
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    OtpService,
    JwtStrategy,
    LocalStrategy,
    // One transport today. An SMS provider becomes a second implementation
    // bound to this token — no caller changes, and production stops failing
    // closed the moment one is configured.
    { provide: OTP_TRANSPORT, useClass: ConsoleOtpTransport },
  ],
  exports: [AuthService, OtpService, JwtModule],
})
export class AuthModule {}

