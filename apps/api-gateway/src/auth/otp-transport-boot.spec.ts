import { Test } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ConsoleOtpTransport } from './console-otp.transport';
import { OTP_TRANSPORT } from './otp-transport.interface';
import { WhatsAppOtpTransport } from './whatsapp-otp.transport';

/**
 * COMPLIANCE-ADJACENT TEST — an unconfigured OTP transport must stop the
 * service, not the claimant.
 *
 * The two halves of this were each reasonable and together were a trap. The
 * console transport logs the code and reports success, so a deployment with no
 * WhatsApp credentials "works"; production separately refuses to return the
 * code in the response, because a code returned over HTTP is not a code. So in
 * production the pair silently swallowed every login on every channel — the
 * claimant asked for a code, was told one was coming, and none ever arrived.
 * Nothing in the logs read as an error.
 *
 * The factory below is the one in `auth.module.ts`, rebuilt here in isolation:
 * bringing up the whole AuthModule would need a database, and what is under
 * test is the selection rule, not the wiring around it.
 */
describe('OTP transport selection at boot', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  const build = async (env: Record<string, string>, configured: boolean) => {
    const whatsapp = { isConfigured: () => configured, name: 'whatsapp' };
    const fallback = { name: 'console' };

    const moduleRef = Test.createTestingModule({
      imports: [ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => env] })],
      providers: [
        { provide: WhatsAppOtpTransport, useValue: whatsapp },
        { provide: ConsoleOtpTransport, useValue: fallback },
        {
          provide: OTP_TRANSPORT,
          useFactory: (
            config: ConfigService,
            resolved: WhatsAppOtpTransport,
            stub: ConsoleOtpTransport
          ) => {
            if (resolved.isConfigured()) return resolved;
            if (config.get<string>('NODE_ENV') === 'production') {
              throw new Error(
                'No OTP transport is configured. Set WHATSAPP_PHONE_NUMBER_ID, ' +
                  'WHATSAPP_ACCESS_TOKEN and WHATSAPP_OTP_TEMPLATE — without all three no ' +
                  'claimant can log in on any channel, and the failure is silent.'
              );
            }
            return stub;
          },
          inject: [ConfigService, WhatsAppOtpTransport, ConsoleOtpTransport],
        },
      ],
    }).compile();

    return moduleRef;
  };

  it('refuses to start in production when nothing can deliver a code', async () => {
    await expect(build({ NODE_ENV: 'production' }, false)).rejects.toThrow(
      /No OTP transport is configured/
    );
  });

  it('names the three settings, so the fix does not need the source', async () => {
    await expect(build({ NODE_ENV: 'production' }, false)).rejects.toThrow(
      /WHATSAPP_PHONE_NUMBER_ID.*WHATSAPP_ACCESS_TOKEN.*WHATSAPP_OTP_TEMPLATE/s
    );
  });

  it('starts in production once WhatsApp is configured', async () => {
    const moduleRef = await build({ NODE_ENV: 'production' }, true);
    expect(moduleRef.get(OTP_TRANSPORT)).toMatchObject({ name: 'whatsapp' });
  });

  // The reason the fallback exists: a developer with no WABA still needs a
  // working login. Failing at boot everywhere would trade one silent failure
  // for a loud one nobody asked for.
  it('falls back to the console stub outside production', async () => {
    const moduleRef = await build({ NODE_ENV: 'development' }, false);
    expect(moduleRef.get(OTP_TRANSPORT)).toMatchObject({ name: 'console' });
  });

  it('treats an unset NODE_ENV as not-production', async () => {
    const moduleRef = await build({}, false);
    expect(moduleRef.get(OTP_TRANSPORT)).toMatchObject({ name: 'console' });
  });
});
