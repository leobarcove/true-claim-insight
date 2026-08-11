import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { OtpService } from './otp.service';
import { OTP_TRANSPORT } from './otp-transport.interface';
import { ConsoleOtpTransport } from './console-otp.transport';
import { WhatsAppOtpTransport } from './whatsapp-otp.transport';
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
    ConsoleOtpTransport,
    WhatsAppOtpTransport,
    {
      // WhatsApp when it is configured, the console stub otherwise. Selected
      // by `isConfigured()` rather than by an environment flag, so there is no
      // state where the flag says one thing and the credentials say another —
      // and a deployment that has not set up a WABA yet degrades to something
      // that works locally instead of failing at startup.
      provide: OTP_TRANSPORT,
      useFactory: (whatsapp: WhatsAppOtpTransport, fallback: ConsoleOtpTransport) =>
        whatsapp.isConfigured() ? whatsapp : fallback,
      inject: [WhatsAppOtpTransport, ConsoleOtpTransport],
    },
  ],
  exports: [AuthService, OtpService, JwtModule],
})
export class AuthModule {}

