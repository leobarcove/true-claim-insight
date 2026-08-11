import { createHmac } from 'crypto';
import { CaseChannel } from '@prisma/client';

import { splitForWhatsApp, WhatsAppAdapter } from './whatsapp.adapter';
import { WhatsAppWebhookController } from './whatsapp.controller';

/**
 * WhatsApp as a third channel behind the same gateway.
 *
 * The flow is not retested here — there is one of it, shared with Telegram and
 * web chat, and it is covered once. What has to hold is the seam: the platform
 * differences, and the two places where getting it wrong is silent.
 */
describe('WhatsApp channel', () => {
  const config = (over: Record<string, string | undefined> = {}) => ({
    get: (key: string) =>
      ({
        WHATSAPP_PHONE_NUMBER_ID: '123',
        WHATSAPP_ACCESS_TOKEN: 'token',
        WHATSAPP_APP_SECRET: 'secret',
        WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify-me',
        ...over,
      })[key],
  });

  const adapter = (over = {}) => new WhatsAppAdapter({ post: jest.fn(), get: jest.fn() } as never, config(over) as never);

  describe('reading an inbound message', () => {
    it('carries the sender’s verified number on every message', () => {
      // The platform difference that removes a whole onboarding step: Telegram
      // needs request_contact and a check that the card is the sender's own,
      // and a WhatsApp message can only come from the account that sent it.
      const turn = adapter().parseMessage({ id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } });

      expect(turn?.sharedPhone).toBe('+60123456789');
      expect(turn?.channel).toBe(CaseChannel.WHATSAPP);
      expect(turn?.text).toBe('hi');
    });

    it('keeps the step with a tapped list row', () => {
      // Without this a second tap lands on whichever question replaced the
      // one shown — which on Telegram stored the claim type as the policy
      // number, silently, on the claimant's first interaction.
      const turn = adapter().parseMessage({
        id: 'wamid.2',
        from: '60123456789',
        type: 'interactive',
        interactive: { list_reply: { id: '__claim-type|FLIGHT_DELAY' } },
      });

      expect(turn?.callbackStepId).toBe('__claim-type');
      expect(turn?.callbackValue).toBe('FLIGHT_DELAY');
    });

    it('splits a row id on the first separator only', () => {
      // An authored choice value may legitimately contain one.
      const turn = adapter().parseMessage({
        id: 'wamid.3',
        from: '60123456789',
        type: 'interactive',
        interactive: { list_reply: { id: 'step|a|b' } },
      });

      expect(turn?.callbackValue).toBe('a|b');
    });

    it('keeps a photo caption', () => {
      const turn = adapter().parseMessage({
        id: 'wamid.4',
        from: '60123456789',
        type: 'image',
        image: { id: 'media-1', caption: 'the broken wheel' },
      });

      expect(turn?.mediaRef).toBe('media-1');
      expect(turn?.text).toBe('the broken wheel');
    });

    it('names an unreadable kind rather than dropping it', () => {
      // Silence in response to a voice note reads as a broken bot.
      const turn = adapter().parseMessage({ id: 'wamid.5', from: '60123456789', type: 'audio' });
      expect(turn?.unsupportedMedia).toBe('audio');
    });

    it('ignores a message with no sender', () => {
      expect(adapter().parseMessage({ id: 'wamid.6', type: 'text' })).toBeNull();
    });
  });

  describe('splitting a long body', () => {
    it('splits rather than truncates at the 1024 cap', () => {
      // The review embeds the whole answer summary on a channel with no
      // summary panel. Clipping it asks a claimant to confirm a claim whose
      // details were cut off mid-line.
      const parts = splitForWhatsApp('x'.repeat(2500), 1024);
      expect(parts.length).toBeGreaterThan(1);
      expect(parts.join('').length).toBe(2500);
      expect(parts.every(part => part.length <= 1024)).toBe(true);
    });

    it('prefers a line break', () => {
      const text = `${'a'.repeat(600)}\n${'b'.repeat(600)}`;
      expect(splitForWhatsApp(text, 1024)[0]).toBe('a'.repeat(600));
    });
  });

  describe('the webhook', () => {
    const build = (over: Record<string, string | undefined> = {}) => {
      const handleTurn = jest.fn().mockResolvedValue(undefined);
      const controller = new WhatsAppWebhookController(
        { handleTurn } as never,
        adapter(),
        config(over) as never
      );
      return { controller, handleTurn };
    };

    const sign = (body: unknown, secret = 'secret') =>
      `sha256=${createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex')}`;

    const delivery = (messages: unknown[]) => ({
      entry: [{ changes: [{ value: { contacts: [{ wa_id: '60123456789' }], messages } }] }],
    });

    it('echoes the challenge when the verify token matches', () => {
      // Failing this is the commonest reason a WhatsApp integration silently
      // does nothing: the subscription is never created.
      expect(build().controller.verify('subscribe', 'verify-me', 'challenge-1')).toBe('challenge-1');
    });

    it('refuses a wrong verify token', () => {
      expect(() => build().controller.verify('subscribe', 'wrong', 'c')).toThrow();
    });

    it('handles a signed message', async () => {
      const { controller, handleTurn } = build();
      const body = delivery([{ id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } }]);

      await controller.receive(sign(body), body as never);

      expect(handleTurn).toHaveBeenCalledTimes(1);
    });

    it('discards an unsigned delivery', async () => {
      // The payload names a claimant's phone number, so forging one would let
      // a stranger drive somebody else's intake.
      const { controller, handleTurn } = build();
      const body = delivery([{ id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } }]);

      await controller.receive(undefined, body as never);
      await controller.receive('sha256=deadbeef', body as never);

      expect(handleTurn).not.toHaveBeenCalled();
    });

    it('discards everything when no app secret is set, rather than trusting', async () => {
      const { controller, handleTurn } = build({ WHATSAPP_APP_SECRET: undefined });
      const body = delivery([{ id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } }]);

      await controller.receive(sign(body), body as never);

      expect(handleTurn).not.toHaveBeenCalled();
    });

    it('ignores delivery and read receipts', async () => {
      // They arrive on the same webhook and outnumber real messages severalfold.
      const { controller, handleTurn } = build();
      const body = { entry: [{ changes: [{ value: { statuses: [{ status: 'read' }] } }] }] };

      await controller.receive(sign(body), body as never);

      expect(handleTurn).not.toHaveBeenCalled();
    });

    it('always answers 200, even when a message fails', async () => {
      // Meta retries a non-200 for seven days. A payload that can never
      // succeed would be redelivered all week with every later message queued
      // behind it.
      const { controller, handleTurn } = build();
      handleTurn.mockRejectedValue(new Error('database down'));
      const body = delivery([{ id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } }]);

      await expect(controller.receive(sign(body), body as never)).resolves.toEqual({
        received: true,
      });
    });

    it('one bad message does not cost the others in the delivery', async () => {
      const { controller, handleTurn } = build();
      handleTurn.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
      const body = delivery([
        { id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'one' } },
        { id: 'wamid.2', from: '60129999999', type: 'text', text: { body: 'two' } },
      ]);

      await controller.receive(sign(body), body as never);

      // They are unrelated claimants.
      expect(handleTurn).toHaveBeenCalledTimes(2);
    });
  });
});
