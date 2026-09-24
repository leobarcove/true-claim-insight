import { BadRequestException } from '@nestjs/common';
import { CaseChannel } from '@prisma/client';
import { CHANNEL_CAPABILITIES, CHANNEL_LABELS } from '@tci/shared-types';

import { ClaimantConversationService } from './claimant-conversation.service';
import { PublicConversationController } from './public-conversation.controller';

/**
 * The web form is its own channel, and that is the whole of D1.
 *
 * A ConversationBinding is keyed on (channel, platformUserId). Nothing else
 * separates the form from the web chat — no time window, no tenant filter, no
 * flag. So if `bindingFor` ever went back to hardcoding WEB_CHAT, the two
 * surfaces would silently merge into one thread and one claim request, and the
 * only symptom would be a claimant seeing half a form they abandoned appear
 * inside a chat. These tests are the tripwire for that.
 */
describe('WEB_FORM is a channel of its own', () => {
  const buildService = () => {
    const upsert = jest.fn().mockResolvedValue({ id: 'binding-1' });
    const prisma = { conversationBinding: { upsert, findUnique: jest.fn(), update: jest.fn() } };
    const service = new ClaimantConversationService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never
    );
    return { service, upsert };
  };

  it('opens a form session against WEB_FORM, not WEB_CHAT', async () => {
    const { service, upsert } = buildService();

    await service.bindingFor({ sessionId: 'wf:abc', webChannel: CaseChannel.WEB_FORM });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channel_platformUserId: {
            channel: CaseChannel.WEB_FORM,
            platformUserId: 'wf:abc',
          },
        },
        create: expect.objectContaining({ channel: CaseChannel.WEB_FORM }),
      })
    );
  });

  // The chat predates the form and must keep working with no channel supplied.
  it('still opens a chat session against WEB_CHAT when no channel is given', async () => {
    const { service, upsert } = buildService();

    await service.bindingFor({ sessionId: 'plain-uuid' });

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          channel_platformUserId: {
            channel: CaseChannel.WEB_CHAT,
            platformUserId: 'plain-uuid',
          },
        },
        create: expect.objectContaining({ channel: CaseChannel.WEB_CHAT }),
      })
    );
  });

  it('gives the same visitor two separate bindings across the two surfaces', async () => {
    const { service, upsert } = buildService();

    await service.bindingFor({ sessionId: 'same-id' });
    await service.bindingFor({ sessionId: 'same-id', webChannel: CaseChannel.WEB_FORM });

    const [chat, form] = upsert.mock.calls.map(
      ([args]) => args.where.channel_platformUserId.channel
    );
    expect(chat).toBe(CaseChannel.WEB_CHAT);
    expect(form).toBe(CaseChannel.WEB_FORM);
    expect(chat).not.toBe(form);
  });
});

describe('the web-channel header', () => {
  const controller = new PublicConversationController({} as never, {} as never);
  const webChannelFrom = (header?: string) =>
    (controller as unknown as { webChannelFrom: (h?: string) => CaseChannel | undefined })
      .webChannelFrom(header);

  it('accepts the two web surfaces', () => {
    expect(webChannelFrom('WEB_FORM')).toBe(CaseChannel.WEB_FORM);
    expect(webChannelFrom('WEB_CHAT')).toBe(CaseChannel.WEB_CHAT);
  });

  it('defaults to undefined — the caller falls back to web chat', () => {
    expect(webChannelFrom(undefined)).toBeUndefined();
    expect(webChannelFrom('')).toBeUndefined();
  });

  /**
   * The narrowing that matters. A messaging binding exists because a platform
   * vouched for the person and a code proved their number; this door has no way
   * to check either, so it must never be able to name one — not even if the
   * header stopped being set from the signed payload.
   */
  it('refuses a messaging channel, which this door cannot vouch for', () => {
    expect(() => webChannelFrom('TELEGRAM')).toThrow(BadRequestException);
    expect(() => webChannelFrom('WHATSAPP')).toThrow(BadRequestException);
    expect(() => webChannelFrom('STAFF')).toThrow(BadRequestException);
  });

  it('refuses a value that is not a channel at all', () => {
    expect(() => webChannelFrom('constructor')).toThrow(BadRequestException);
    expect(() => webChannelFrom('toString')).toThrow(BadRequestException);
  });
});

describe('WEB_FORM capabilities', () => {
  it('is named for staff, so no operator reads a raw enum', () => {
    expect(CHANNEL_LABELS[CaseChannel.WEB_FORM]).toBe('Web form');
  });

  /**
   * The one deliberate difference from WEB_CHAT. That flag tells the gateway
   * whether to append the answers to the review message; WEB_CHAT has to say
   * false because the panel it promised was never built, and claimants were
   * asked to confirm a submission with nothing on screen. The form draws the
   * panel, so here it is true and honest.
   */
  it('declares a summary panel, which the chat cannot', () => {
    expect(CHANNEL_CAPABILITIES[CaseChannel.WEB_FORM].summaryPanel).toBe(true);
    expect(CHANNEL_CAPABILITIES[CaseChannel.WEB_CHAT].summaryPanel).toBe(false);
  });

  it('matches the chat everywhere else — it is the same browser', () => {
    const form = CHANNEL_CAPABILITIES[CaseChannel.WEB_FORM];
    const chat = CHANNEL_CAPABILITIES[CaseChannel.WEB_CHAT];

    expect(form.choiceStyle).toBe(chat.choiceStyle);
    expect(form.document).toBe(chat.document);
    expect(form.dateEntry).toBe(chat.dateEntry);
    expect(form.maxMessageChars).toBe(chat.maxMessageChars);
    expect(form.platformVerifiedPhone).toBe(chat.platformVerifiedPhone);
    expect(form.retainsPlaintext).toBe(chat.retainsPlaintext);
  });
});
