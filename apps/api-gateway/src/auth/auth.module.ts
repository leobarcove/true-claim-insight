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
      //
      // Except in production, where degrading is the wrong answer. The console
      // transport logs the code and returns; production additionally refuses to
      // hand the code back in the response, so the pair silently swallows every
      // login on every channel — the claimant asks for a code, is told one is on
      // its way, and none ever arrives. Nothing in the logs reads as an error.
      // Fail at boot instead: a service that will not start is a deployment
      // problem, and a deployment problem gets fixed.
      provide: OTP_TRANSPORT,
      useFactory: (
        config: ConfigService,
        whatsapp: WhatsAppOtpTransport,
        fallback: ConsoleOtpTransport
      ) => {
        if (whatsapp.isConfigured()) return whatsapp;

        if (config.get<string>('NODE_ENV') === 'production') {
          throw new Error(
            'No OTP transport is configured. Set WHATSAPP_PHONE_NUMBER_ID, ' +
              'WHATSAPP_ACCESS_TOKEN and WHATSAPP_OTP_TEMPLATE — without all three no ' +
              'claimant can log in on any channel, and the failure is silent.'
          );
        }

        return fallback;
      },
      inject: [ConfigService, WhatsAppOtpTransport, ConsoleOtpTransport],
    },
  ],
  exports: [AuthService, OtpService, JwtModule],
})
export class AuthModule {}

