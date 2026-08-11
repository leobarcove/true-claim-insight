import { ConfigService } from '@nestjs/config';
import { CaseChannel } from '@prisma/client';
import type { HttpService } from '@nestjs/axios';
import { TelegramAdapter } from './telegram.adapter';
import type { TelegramUpdate } from './telegram.types';

/**
 * TELEGRAM ADAPTER.
 *
 * The adapter's whole job is translation, in both directions, and the risky
 * parts are the ones where Telegram's shape does not match ours: an update that
 * is not a turn, a tapped button versus typed text, and a photo that must be
 * referenced rather than downloaded.
 */
describe('TelegramAdapter', () => {
  const makeAdapter = (token?: string) => {
    const config = { get: (key: string) => (key === 'TELEGRAM_BOT_TOKEN' ? token : undefined) };
    const http = { post: jest.fn(), get: jest.fn() };
    return {
      adapter: new TelegramAdapter(
        http as unknown as HttpService,
        config as unknown as ConfigService
      ),
      http,
    };
  };

  const update = (over: Partial<TelegramUpdate>): TelegramUpdate => ({
    update_id: 101,
    ...over,
  });

  const message = (over: Record<string, unknown> = {}) => ({
    message_id: 1,
    // In a private chat the sender id and the chat id are the same. `from`
    // matters now: a shared contact is only trusted when its user_id is the
    // sender's own.
    from: { id: 55501, is_bot: false },
    chat: { id: 55501, type: 'private' },
    date: 0,
    ...over,
  });

  describe('configuration', () => {
    it('is inert without a bot token', () => {
      const { adapter } = makeAdapter(undefined);
      expect(adapter.isConfigured()).toBe(false);
    });

    it('does not attempt to send when unconfigured', async () => {
      const { adapter, http } = makeAdapter(undefined);
      await adapter.send('55501', { text: 'hello' });
      expect(http.post).not.toHaveBeenCalled();
    });

    it('reports the Telegram capability profile', () => {
      const { adapter } = makeAdapter('token');
      expect(adapter.channel).toBe(CaseChannel.TELEGRAM);
      expect(adapter.capabilities.dateEntry).toBe('text');
      expect(adapter.capabilities.retainsPlaintext).toBe(true);
    });
  });

  describe('parseUpdate', () => {
    it('reads a plain text message', () => {
      const { adapter } = makeAdapter('token');
      const payload = adapter.parseUpdate(update({ message: message({ text: 'MH370' }) }));

      expect(payload).toMatchObject({
        channel: CaseChannel.TELEGRAM,
        platformUserId: '55501',
        platformMessageId: '101',
        text: 'MH370',
      });
    });

    it('prefers a tapped button, which needs no interpretation', () => {
      const { adapter } = makeAdapter('token');
      const payload = adapter.parseUpdate(
        update({
          callback_query: {
            id: 'cb1',
            from: { id: 999, is_bot: false },
            message: message(),
            data: 'ILLNESS',
          },
        })
      );

      expect(payload?.callbackValue).toBe('ILLNESS');
      expect(payload?.text).toBeUndefined();
    });

    it('normalises the sender\'s own shared contact into a phone number', () => {
      const { adapter } = makeAdapter('token');
      const payload = adapter.parseUpdate(
        update({
          message: message({ contact: { phone_number: '60123456789', user_id: 55501 } }),
        })
      );

      expect(payload?.sharedPhone).toBe('+60123456789');
      expect(payload?.sharedForeignContact).toBeUndefined();
    });

    it('refuses a contact card belonging to somebody else', () => {
      // COMPLIANCE-ADJACENT: this is the channel's identity control now that
      // no one-time code follows. Telegram lets a user share ANY card from
      // their address book, and reading phone_number without checking whose
      // it is meant an attacker could share the victim's contact and be bound
      // as them. Previously the OTP hid this, because the code went to the
      // real owner's handset.
      const { adapter } = makeAdapter('token');
      const payload = adapter.parseUpdate(
        update({
          message: message({ contact: { phone_number: '60999888777', user_id: 99999 } }),
        })
      );

      expect(payload?.sharedPhone).toBeUndefined();
      expect(payload?.sharedForeignContact).toBe(true);
    });

    it('refuses a contact card with no owner at all', () => {
      // A manually typed card carries no user_id. Absence is not a match.
      const { adapter } = makeAdapter('token');
      const payload = adapter.parseUpdate(
        update({ message: message({ contact: { phone_number: '60999888777' } }) })
      );

      expect(payload?.sharedPhone).toBeUndefined();
      expect(payload?.sharedForeignContact).toBe(true);
    });

    it('keeps the largest photo rendition as a reference, not bytes', () => {
      const { adapter } = makeAdapter('token');
      const payload = adapter.parseUpdate(
        update({
          message: message({
            photo: [
              { file_id: 'small', width: 90, height: 90 },
              { file_id: 'large', width: 1280, height: 1280 },
            ],
          }),
        })
      );

      expect(payload?.mediaRef).toBe('large');
    });

    it('ignores updates that are not turns', () => {
      const { adapter } = makeAdapter('token');
      // No message and no callback — a service notification.
      expect(adapter.parseUpdate(update({}))).toBeNull();
      // A message carrying nothing actionable.
      expect(adapter.parseUpdate(update({ message: message() }))).toBeNull();
    });
  });

  describe('rendering', () => {
    const sentBody = (http: { post: jest.Mock }) => http.post.mock.calls[0][1];

    it('renders a choice step as one inline button per row', async () => {
      const { adapter, http } = makeAdapter('token');
      http.post.mockReturnValue({ subscribe: (o: any) => o.next({ data: {} }) });

      await adapter.send('55501', {
        text: 'Why was the trip cancelled?',
        step: {
          id: 'cancellation-reason',
          prompt: 'Why?',
          label: 'Reason',
          answerType: 'choice',
          choices: [
            { value: 'ILLNESS', label: 'Serious illness' },
            { value: 'OTHER', label: 'Other reason' },
          ],
          next: { type: 'end' },
        },
      });

      // callback_data carries the step it was rendered for, so a tap that
      // arrives after the conversation has moved on can be told apart from an
      // answer to the current question.
      expect(sentBody(http).reply_markup).toEqual({
        inline_keyboard: [
          [{ text: 'Serious illness', callback_data: 'cancellation-reason|ILLNESS' }],
          [{ text: 'Other reason', callback_data: 'cancellation-reason|OTHER' }],
        ],
      });
    });

    it('drops the step id rather than exceeding Telegram\'s 64-byte cap', async () => {
      // Over the cap Telegram rejects the send outright with a 400, which
      // would take out the question itself. Losing the staleness check is the
      // lesser failure, and it is logged.
      const { adapter, http } = makeAdapter('token');
      http.post.mockReturnValue({ subscribe: (o: any) => o.next({ data: {} }) });
      const longStepId = 'a-step-id-of-quite-unreasonable-length-for-an-authored-flow';

      await adapter.send('55501', {
        text: 'Pick one',
        step: {
          id: longStepId,
          prompt: 'Pick one',
          label: 'Pick',
          answerType: 'choice',
          choices: [{ value: 'SOMETHING_FAIRLY_LONG_TOO', label: 'Something' }],
          next: { type: 'end' },
        },
      });

      const data = sentBody(http).reply_markup.inline_keyboard[0][0].callback_data;
      expect(Buffer.byteLength(data, 'utf8')).toBeLessThanOrEqual(64);
      expect(data).toBe('SOMETHING_FAIRLY_LONG_TOO');
    });

    it('offers a contact button when a phone is requested', async () => {
      const { adapter, http } = makeAdapter('token');
      http.post.mockReturnValue({ subscribe: (o: any) => o.next({ data: {} }) });

      await adapter.send('55501', { text: 'Your number please', requestPhone: true });

      expect(sentBody(http).reply_markup).toMatchObject({
        keyboard: [[{ text: '📱 Share my number', request_contact: true }]],
      });
    });

    it('truncates a body Telegram would reject outright', async () => {
      const { adapter, http } = makeAdapter('token');
      http.post.mockReturnValue({ subscribe: (o: any) => o.next({ data: {} }) });

      await adapter.send('55501', { text: 'x'.repeat(5000) });

      const body = sentBody(http);
      expect(body.text.length).toBe(adapter.capabilities.maxMessageChars);
      expect(body.text.endsWith('…')).toBe(true);
    });

    it('sends no keyboard for a free-text step', async () => {
      const { adapter, http } = makeAdapter('token');
      http.post.mockReturnValue({ subscribe: (o: any) => o.next({ data: {} }) });

      await adapter.send('55501', {
        text: 'Which airline?',
        step: {
          id: 'airline',
          prompt: 'Which airline?',
          label: 'Airline',
          answerType: 'text',
          next: { type: 'end' },
        },
      });

      expect(sentBody(http).reply_markup).toBeUndefined();
    });
  });
});
