import { UnauthorizedException } from '@nestjs/common';

import { AuthService } from './auth.service';

/**
 * COMPLIANCE-ADJACENT TEST — the door to the agent-assisted form.
 *
 * An agent reaches the claimant's own form from a staff address and fills it in
 * on their behalf, with no code sent to the claimant. What stands in place of
 * that code is this sign-in: the agent proves *their own* number instead. So
 * this is the control that decides whether a stranger can enter claims against
 * any number they can type, and two properties matter more than convenience.
 *
 * **It must not answer "is this person one of yours?"** A staff directory is
 * the first thing anyone phishing an adjusting firm would like, and a response
 * that varied by whether the number was known would hand it over for free.
 *
 * **A claimant account must never open it.** Claimants have numbers and
 * accounts too; if one could sign in here they would reach a surface that skips
 * the claimant's own verification entirely.
 */
describe('staff sign-in by mobile', () => {
  const build = (user: Record<string, unknown> | null) => {
    const agent = user
      ? {
          id: 'piam-agent-1',
          registrationNumber: '999999-00',
          agentName: 'Emily Tan',
          agencyName: 'MSIG Insurance (Malaysia) Bhd',
          phoneNumber: '60129876543',
          tenantId: 'msig-1',
        }
      : null;
    const usersService = {
      findByPhoneNumber: jest.fn().mockResolvedValue(user),
      isPiamRegisteredAgent: jest.fn().mockResolvedValue(true),
      findPiamRegisteredAgent: jest.fn().mockResolvedValue(agent),
      findPiamRegisteredAgentById: jest.fn().mockResolvedValue(agent),
      updateLastLogin: jest.fn().mockResolvedValue(undefined),
    };
    const otpService = {
      sendOtp: jest.fn().mockResolvedValue({ expiresIn: 300, code: '482913' }),
      verifyOtp: jest.fn().mockResolvedValue(true),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const jwtService = { signAsync: jest.fn().mockResolvedValue('token') };
    const configService = { get: jest.fn((_key: string, fallback?: string) => fallback) };

    const service = Object.create(AuthService.prototype) as AuthService;
    Object.assign(service, {
      usersService,
      otpService,
      audit,
      jwtService,
      configService,
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      getUserTenants: jest.fn().mockResolvedValue([]),
    });

    return { service, usersService, otpService, audit, jwtService };
  };

  const staff = {
    id: 'user-1',
    email: 'faiz@pacific.com',
    fullName: 'Faiz Rahman',
    role: 'ADJUSTER',
    phoneNumber: '+60129876543',
    tenantId: 'pacific-1',
    isVerified: true,
  };

  describe('sending the code', () => {
    it('sends to the number on the account', async () => {
      const { service, otpService } = build(staff);

      const result = await service.staffSendCode('999999-00', '+60129876543');

      expect(otpService.sendOtp).toHaveBeenCalledWith('+60129876543');
      expect(result.expiresIn).toBe(300);
    });

    it('sends nothing for an unknown number', async () => {
      const { service, otpService } = build(null);

      await expect(service.staffSendCode('999999-00', '+60111111111')).resolves.toMatchObject({
        expiresIn: 300,
        code: expect.stringMatching(/^\d{6}$/),
      });

      expect(otpService.sendOtp).not.toHaveBeenCalled();
    });

    /**
     * The shape of the answer must not reveal whether the number is known —
     * including the expiry, which a client would otherwise display.
     */
    it('refuses when the PIAM registration and phone do not match', async () => {
      const context = build(staff);
      context.usersService.findPiamRegisteredAgent.mockResolvedValue(null);

      await expect(
        context.service.staffSendCode('000000-00', '+60129876543')
      ).resolves.toMatchObject({
        expiresIn: 300,
        code: expect.stringMatching(/^\d{6}$/),
      });
      expect(context.otpService.sendOtp).not.toHaveBeenCalled();
    });

    it('returns the same public shape for known and unknown identities', async () => {
      const known = build(staff);
      const unknown = build(null);

      const knownResult = await known.service.staffSendCode('999999-00', '+60129876543');
      const unknownResult = await unknown.service.staffSendCode('999999-00', '+60111111111');

      expect(Object.keys(unknownResult).sort()).toEqual(Object.keys(knownResult).sort());
      expect(unknownResult.expiresIn).toBe(knownResult.expiresIn);
    });

    it('records the miss, so a sweep of numbers is visible afterwards', async () => {
      const { service, audit } = build(null);

      await service.staffSendCode('999999-00', '+60111111111').catch(() => undefined);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STAFF_CODE_REQUESTED_UNKNOWN_NUMBER' })
      );
    });

    it('does not consult users-table verification', async () => {
      const { service, otpService } = build({ ...staff, isVerified: false });

      await service.staffSendCode('999999-00', '+60129876543');

      expect(otpService.sendOtp).toHaveBeenCalled();
    });

    it('does not consult the users-table role', async () => {
      const { service, otpService } = build({ ...staff, role: 'CLAIMANT' });

      await service.staffSendCode('999999-00', '+60129876543');

      expect(otpService.sendOtp).toHaveBeenCalled();
    });
  });

  describe('verifying the code', () => {
    it('signs the agent in', async () => {
      const { service } = build(staff);

      const result = await service.staffVerifyCode('999999-00', '+60129876543', '482913');

      expect(result.user.id).toBe('piam-agent-1');
      expect(result.user.fullName).toBe('Emily Tan');
      expect(result.user.tenantName).toBe('MSIG Insurance (Malaysia) Bhd');
      expect(result.tokens).toBeDefined();
    });

    it('refuses a wrong code', async () => {
      const { service, otpService } = build(staff);
      otpService.verifyOtp.mockResolvedValue(false);

      await expect(service.staffVerifyCode('999999-00', '+60129876543', '000000')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('refuses when the code throws rather than returning false', async () => {
      const { service, otpService } = build(staff);
      otpService.verifyOtp.mockRejectedValue(new Error('no code outstanding'));

      await expect(service.staffVerifyCode('999999-00', '+60129876543', '482913')).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('ignores an unrelated claimant row with the same phone', async () => {
      const { service } = build({ ...staff, role: 'CLAIMANT' });

      await expect(
        service.staffVerifyCode('999999-00', '+60129876543', '482913')
      ).resolves.toBeDefined();
    });

    it('ignores users-table verification state', async () => {
      const { service } = build({ ...staff, isVerified: false });

      await expect(
        service.staffVerifyCode('999999-00', '+60129876543', '482913')
      ).resolves.toBeDefined();
    });

    /**
     * Same refusal whether the code was wrong or the account does not exist.
     * A different message would answer the directory question the send step
     * was careful not to.
     */
    it('gives one refusal for a wrong code and an unknown number alike', async () => {
      const wrongCode = build(staff);
      wrongCode.otpService.verifyOtp.mockResolvedValue(false);
      const unknownNumber = build(null);

      const messageOf = async (fn: () => Promise<unknown>) => {
        try {
          await fn();
        } catch (error) {
          return (error as UnauthorizedException).message;
        }
        throw new Error('expected a refusal');
      };

      expect(
        await messageOf(() => wrongCode.service.staffVerifyCode('999999-00', '+60129876543', 'x'))
      ).toBe(
        await messageOf(() =>
          unknownNumber.service.staffVerifyCode('999999-00', '+60111111111', 'x')
        )
      );
    });

    /**
     * `keepSignedIn` lengthens the *refresh* token only. The access token is
     * untouched, so it still expires in minutes and every renewal re-reads the
     * account — a long-lived refresh is not a long-lived grant.
     */
    it('lengthens only the refresh token when asked to keep them signed in', async () => {
      const { service, jwtService } = build(staff);

      await service.staffVerifyCode('999999-00', '+60129876543', '482913', true);

      const [, refreshCall] = jwtService.signAsync.mock.calls;
      expect(refreshCall[1].expiresIn).toBe(30 * 24 * 60 * 60);

      const [accessCall] = jwtService.signAsync.mock.calls;
      expect(accessCall[1].expiresIn).toBeLessThanOrEqual(60 * 60);
    });

    it('uses the ordinary refresh life when not asked', async () => {
      const { service, jwtService } = build(staff);

      await service.staffVerifyCode('999999-00', '+60129876543', '482913', false);

      const [, refreshCall] = jwtService.signAsync.mock.calls;
      expect(refreshCall[1].expiresIn).toBe(7 * 24 * 60 * 60);
    });

    it('records the sign-in against the agent', async () => {
      const { service, audit } = build(staff);

      await service.staffVerifyCode('999999-00', '+60129876543', '482913');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STAFF_LOGIN_SUCCEEDED',
          actorId: 'piam-agent-1',
          metadata: expect.objectContaining({ method: 'mobile-code' }),
        })
      );
    });

    it('records a failure without naming whether the account exists', async () => {
      const { service, audit } = build(null);

      await service.staffVerifyCode('999999-00', '+60111111111', 'x').catch(() => undefined);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STAFF_LOGIN_FAILED' })
      );
    });
  });
});
