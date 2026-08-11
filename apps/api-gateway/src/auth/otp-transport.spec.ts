import { ServiceUnavailableException } from '@nestjs/common';

import { ConsoleOtpTransport } from './console-otp.transport';
import { OtpService } from './otp.service';

/**
 * COMPLIANCE-ADJACENT TEST — a one-time code returned over HTTP is not a
 * one-time code.
 *
 * There is no SMS provider, so `sendOtp` returns the code in the response and
 * the app fills it in. That is the only way a claimant can reach the in-country
 * web channel today, and it is safe exactly as far as one condition holds: it
 * must never happen in production. There, an undelivered code is an outage and
 * the request fails.
 *
 * What is *not* happening here, and the distinction is the point: verification
 * is not skipped. The code is still CSPRNG-generated, stored, expiring, rate
 * limited and attempt-counted. The bypass removed on 10 August was a hardcoded
 * value that verified any phone number in any environment — a different thing,
 * and nothing below reintroduces it.
 */
describe('OTP delivery', () => {
  const originalEnv = process.env.NODE_ENV;

  const build = (transport: { name: string; isConfigured: () => boolean; send: jest.Mock }) => {
    const prisma = {
      otpCode: {
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        create: jest.fn().mockResolvedValue({ id: 'otp-1' }),
      },
    };
    return new OtpService(prisma as never, transport as never);
  };

  const undeliverable = () => ({
    name: 'console',
    isConfigured: () => true,
    send: jest.fn().mockResolvedValue({ delivered: false }),
  });

  const working = () => ({
    name: 'sms',
    isConfigured: () => true,
    send: jest.fn().mockResolvedValue({ delivered: true }),
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('returns the code when nothing can send it, outside production', () => {
    process.env.NODE_ENV = 'development';
    return expect(build(undeliverable()).sendOtp('+60123456789')).resolves.toEqual(
      expect.objectContaining({ code: expect.stringMatching(/^\d{6}$/) })
    );
  });

  it('refuses rather than returning a code in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(build(undeliverable()).sendOtp('+60123456789')).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });

  it('treats an unset NODE_ENV as production', async () => {
    // Guessing wrong in this direction breaks a login. Guessing wrong the
    // other way hands a live credential to whoever asked for it.
    delete process.env.NODE_ENV;
    await expect(build(undeliverable()).sendOtp('+60123456789')).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });

  it('never returns a code once something can actually send it', async () => {
    process.env.NODE_ENV = 'development';
    const result = await build(working()).sendOtp('+60123456789');
    // The escape hatch closes by itself the day an SMS provider is bound —
    // no flag to remember to turn off.
    expect(result.code).toBeUndefined();
  });

  it('hands the transport a six-digit code it did not choose', async () => {
    process.env.NODE_ENV = 'development';
    const transport = working();
    await build(transport).sendOtp('+60123456789');
    const [phone, code] = transport.send.mock.calls[0];
    expect(phone).toBe('+60123456789');
    expect(code).toMatch(/^\d{6}$/);
  });

  describe('the console transport', () => {
    it('reports that it did not deliver, rather than pretending', async () => {
      // Reporting success would leave production believing codes were sent.
      await expect(new ConsoleOtpTransport().send('+60123456789', '123456')).resolves.toEqual({
        delivered: false,
      });
    });

    it('is configured — it can run, it just cannot deliver', () => {
      expect(new ConsoleOtpTransport().isConfigured()).toBe(true);
    });

    it('never writes the code to the log', async () => {
      // Logs are shipped, searched and retained; a credential in one is a
      // credential in all of them. The implementation this replaced printed it.
      const warn = jest.spyOn(require('@nestjs/common').Logger.prototype, 'warn').mockImplementation();
      await new ConsoleOtpTransport().send('+60123456789', '424242');
      const logged = warn.mock.calls.flat().join(' ');
      expect(logged).not.toContain('424242');
      warn.mockRestore();
    });
  });
});
