import { WhatsAppOtpTransport } from './whatsapp-otp.transport';

/**
 * Delivering the login code over WhatsApp.
 *
 * Two properties carry weight. The transport must be honest about whether it
 * delivered, because the service returns the code to the caller when nothing
 * did — and in production refuses outright. And every send is a transfer of a
 * Malaysian claimant's phone number to Meta in the United States, which the
 * PDPA s.129 register has to show whether or not the send succeeds.
 */
describe('WhatsApp OTP transport', () => {
  const settings: Record<string, string> = {
    WHATSAPP_PHONE_NUMBER_ID: '123456',
    WHATSAPP_ACCESS_TOKEN: 'token',
    WHATSAPP_OTP_TEMPLATE: 'claim_login_code',
  };

  const build = (overrides: Record<string, string | undefined> = {}) => {
    const config = { get: (key: string) => ({ ...settings, ...overrides })[key] };
    const create = jest.fn().mockResolvedValue({ id: 'transfer-1' });
    const transport = new WhatsAppOtpTransport(
      config as never,
      { transferRecord: { create } } as never
    );
    return { transport, create };
  };

  const okResponse = { ok: true, status: 200, text: async () => '' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is unconfigured until every setting is present', () => {
    expect(build().transport.isConfigured()).toBe(true);
    // A half-configured transport reporting itself ready would make the
    // service believe codes were going out, and production would then refuse
    // to return the code — a login that silently never works.
    expect(build({ WHATSAPP_ACCESS_TOKEN: undefined }).transport.isConfigured()).toBe(false);
    expect(build({ WHATSAPP_OTP_TEMPLATE: undefined }).transport.isConfigured()).toBe(false);
  });

  it('does not attempt a send when unconfigured', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const { transport } = build({ WHATSAPP_PHONE_NUMBER_ID: undefined });

    await expect(transport.send('+60123456789', '123456')).resolves.toEqual({ delivered: false });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends the code in the body and the button', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse as never);
    const { transport } = build();

    await transport.send('+60123456789', '424242');

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as { body: string }).body);
    const [bodyComponent, buttonComponent] = body.template.components;
    expect(bodyComponent.parameters[0].text).toBe('424242');
    // Body only would render a "Copy code" button that copies nothing.
    expect(buttonComponent.parameters[0].text).toBe('424242');
    expect(body.template.name).toBe('claim_login_code');
  });

  it('reports delivery only when Meta accepted it', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse as never);
    await expect(build().transport.send('+60123456789', '1')).resolves.toEqual({ delivered: true });
  });

  it('reports failure when Meta rejects it', async () => {
    // An unapproved template, a number outside the test allow-list, a spent
    // token. The service then falls back rather than believing it sent.
    jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":{"message":"template not found"}}',
    } as never);

    await expect(build().transport.send('+60123456789', '1')).resolves.toEqual({
      delivered: false,
    });
  });

  it('reports failure rather than throwing when the network dies', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
    await expect(build().transport.send('+60123456789', '1')).resolves.toEqual({
      delivered: false,
    });
  });

  describe('the cross-border record', () => {
    it('is written for every send', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse as never);
      const { transport, create } = build();

      await transport.send('+60123456789', '424242');

      const [args] = create.mock.calls[0];
      expect(args.data.provider).toBe('WHATSAPP');
      expect(args.data.country).toContain('United States');
      // No basis is established for this channel, and the register is useful
      // precisely because it says so rather than leaving the field out.
      expect(args.data.lawfulBasis).toBeNull();
    });

    it('is written even when the send fails', async () => {
      // The number reached Meta either way. A register that only logged
      // successes would understate what left the country.
      jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNRESET'));
      const { transport, create } = build();

      await transport.send('+60123456789', '424242');

      expect(create).toHaveBeenCalledTimes(1);
    });

    it('never records the code itself', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse as never);
      const { transport, create } = build();

      await transport.send('+60123456789', '424242');

      expect(JSON.stringify(create.mock.calls[0][0])).not.toContain('424242');
    });
  });
});
