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
        // The senders the deliveries below come from. Jest runs with
        // NODE_ENV=test, so the allowlist guard is live in here — leaving this
        // unset would deny every message and the seam would go untested. The
        // second number belongs to the two-claimants-in-one-delivery case.
        WHATSAPP_ALLOWED_SENDERS: '60123456789,60129999999',
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

    const signRaw = (raw: string, secret = 'secret') =>
      `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;

    /**
     * Deliver the way Meta does: a signature over the exact bytes sent, with
     * the parsed body alongside them.
     *
     * `raw` may be supplied to reproduce a serialisation that differs from
     * JSON.stringify — which is the whole point, because Meta's does.
     */
    const post = (
      controller: WhatsAppWebhookController,
      body: unknown,
      opts: { raw?: string; secret?: string; signature?: string | null } = {}
    ) => {
      const raw = opts.raw ?? JSON.stringify(body);
      const signature =
        opts.signature === null ? undefined : (opts.signature ?? signRaw(raw, opts.secret));
      return controller.receive(
        signature,
        JSON.parse(raw) as never,
        { rawBody: Buffer.from(raw) } as never
      );
    };

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

      await post(controller, body);

      expect(handleTurn).toHaveBeenCalledTimes(1);
    });

    it('verifies a delivery Meta serialised with escaped slashes', async () => {
      // THE BUG, pinned. Meta's backend is PHP, whose json_encode escapes
      // forward slashes: it sends 16\/06\/2026 where JSON.stringify writes
      // 16/06/2026. Verification used to hash a re-serialised copy of the
      // parsed body, so the bytes differed and the HMAC never matched.
      //
      // What made it survive a day in production is the shape of the damage:
      // "Hi", a policy number and a name carry no slash and verified fine, so
      // the channel looked healthy — while every date failed, on a flow that
      // asks for DD/MM/YYYY. Intake could not get past the trip-date question,
      // and a discarded delivery still answers 200, so nothing alarmed.
      const { controller, handleTurn } = build();
      const body = delivery([
        { id: 'wamid.1', from: '60123456789', type: 'text', text: { body: '16/06/2026' } },
      ]);
      const metaStyle = JSON.stringify(body).replace(/\//g, '\\/');
      expect(metaStyle).toContain('16\\/06\\/2026'); // the bytes Meta actually sends

      await post(controller, body, { raw: metaStyle });

      expect(handleTurn).toHaveBeenCalledTimes(1);
    });

    it('discards a delivery when the raw body is unavailable, rather than falling back', async () => {
      // Fail closed. The only available fallback is hashing the re-serialised
      // body, which is the bug above: it works for most messages and silently
      // drops every one containing a slash. A channel that dies loudly gets
      // fixed; one that drops a third of its messages does not.
      const { controller, handleTurn } = build();
      const body = delivery([
        { id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } },
      ]);

      await controller.receive(signRaw(JSON.stringify(body)), body as never, {} as never);

      expect(handleTurn).not.toHaveBeenCalled();
    });

    it('discards an unsigned delivery', async () => {
      // The payload names a claimant's phone number, so forging one would let
      // a stranger drive somebody else's intake.
      const { controller, handleTurn } = build();
      const body = delivery([{ id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } }]);

      await post(controller, body, { signature: null });
      await post(controller, body, { signature: 'sha256=deadbeef' });

      expect(handleTurn).not.toHaveBeenCalled();
    });

    it('discards everything when no app secret is set, rather than trusting', async () => {
      const { controller, handleTurn } = build({ WHATSAPP_APP_SECRET: undefined });
      const body = delivery([{ id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } }]);

      await post(controller, body);

      expect(handleTurn).not.toHaveBeenCalled();
    });

    it('drops a signed message from a sender outside the allowlist', async () => {
      // The signature proves Meta sent the delivery, not who typed it. A live
      // WhatsApp number is dialable by anyone who has it.
      const { controller, handleTurn } = build();
      const body = {
        entry: [
          {
            changes: [
              {
                value: {
                  contacts: [{ wa_id: '60999999999' }],
                  messages: [
                    { id: 'wamid.1', from: '60999999999', type: 'text', text: { body: 'hi' } },
                  ],
                },
              },
            ],
          },
        ],
      };

      await post(controller, body);

      expect(handleTurn).not.toHaveBeenCalled();
    });

    it('accepts a number written in a readable form', async () => {
      // The value is typed by a human into a .env, so it is normalised to
      // digits on both sides before comparison.
      const { controller, handleTurn } = build({ WHATSAPP_ALLOWED_SENDERS: '+60 12-345 6789' });
      const body = delivery([
        { id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } },
      ]);

      await post(controller, body);

      expect(handleTurn).toHaveBeenCalledTimes(1);
    });

    it('drops everything when the allowlist is empty, rather than waving it through', async () => {
      // Failing closed, as the app secret does. A guard that defaults to open
      // does nothing until somebody remembers to configure it, and they will
      // not, because the channel works perfectly without it.
      const { controller, handleTurn } = build({ WHATSAPP_ALLOWED_SENDERS: undefined });
      const body = delivery([
        { id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } },
      ]);

      await post(controller, body);

      expect(handleTurn).not.toHaveBeenCalled();
    });

    it('does not apply in production, where every claimant is a stranger', async () => {
      // An allowlist in front of a public intake channel would exclude exactly
      // the people it exists for, so it cannot survive launch by accident.
      const previous = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const { controller, handleTurn } = build({ WHATSAPP_ALLOWED_SENDERS: undefined });
        const body = delivery([
          { id: 'wamid.1', from: '60999999999', type: 'text', text: { body: 'hi' } },
        ]);

        await post(controller, body);

        expect(handleTurn).toHaveBeenCalledTimes(1);
      } finally {
        process.env.NODE_ENV = previous;
      }
    });

    it('ignores delivery and read receipts', async () => {
      // They arrive on the same webhook and outnumber real messages severalfold.
      const { controller, handleTurn } = build();
      const body = { entry: [{ changes: [{ value: { statuses: [{ status: 'read' }] } }] }] };

      await post(controller, body);

      expect(handleTurn).not.toHaveBeenCalled();
    });

    it('always answers 200, even when a message fails', async () => {
      // Meta retries a non-200 for seven days. A payload that can never
      // succeed would be redelivered all week with every later message queued
      // behind it.
      const { controller, handleTurn } = build();
      handleTurn.mockRejectedValue(new Error('database down'));
      const body = delivery([{ id: 'wamid.1', from: '60123456789', type: 'text', text: { body: 'hi' } }]);

      await expect(post(controller, body)).resolves.toEqual({
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

      await post(controller, body);

      // They are unrelated claimants.
      expect(handleTurn).toHaveBeenCalledTimes(2);
    });
  });
});
