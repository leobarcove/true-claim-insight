import { createHmac } from 'crypto';

import { TelegramAdapter } from './telegram.adapter';

/**
 * The Mini App attestation, exercised against signatures built the way
 * Telegram builds them.
 *
 * This is the check that stands between an opened webview and someone else's
 * claim. Every test below is a way in if the implementation is wrong, so they
 * are written as attacks rather than as assertions about a happy path.
 */
const BOT_TOKEN = '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11';

const adapterWith = (token?: string) =>
  new TelegramAdapter({} as never, {
    get: (key: string) => (key === 'TELEGRAM_BOT_TOKEN' ? token : undefined),
  } as never);

/** Sign a set of launch parameters exactly as Telegram does. */
const sign = (fields: Record<string, string>, token = BOT_TOKEN): string => {
  const checkString = Object.entries(fields)
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  const hash = createHmac('sha256', secret).update(checkString).digest('hex');
  return new URLSearchParams({ ...fields, hash }).toString();
};

const NOW = new Date('2026-08-18T12:00:00Z');
const freshFields = (overrides: Record<string, string> = {}) => ({
  auth_date: String(Math.floor(NOW.getTime() / 1000) - 30),
  query_id: 'AAF_test',
  user: JSON.stringify({ id: 987654321, first_name: 'Leo' }),
  ...overrides,
});

describe('a Mini App launch is only trusted when Telegram signed it', () => {
  it('accepts a correctly signed launch and returns the user id', () => {
    const adapter = adapterWith(BOT_TOKEN);
    expect(adapter.verifyInitData(sign(freshFields()), NOW)).toBe('987654321');
  });

  it('refuses a launch signed with a different bot token', () => {
    // The whole attestation rests on the token being secret. Somebody else's
    // bot must not be able to vouch for a user on ours.
    const adapter = adapterWith(BOT_TOKEN);
    expect(adapter.verifyInitData(sign(freshFields(), 'other:token'), NOW)).toBeNull();
  });

  it('refuses a launch whose user id was swapped after signing', () => {
    // The attack this exists to stop: take your own valid launch, edit the id
    // to someone else's, and open their claim.
    const adapter = adapterWith(BOT_TOKEN);
    const params = new URLSearchParams(sign(freshFields()));
    params.set('user', JSON.stringify({ id: 111111111, first_name: 'Mallory' }));
    expect(adapter.verifyInitData(params.toString(), NOW)).toBeNull();
  });

  it('refuses a launch with no signature at all', () => {
    const adapter = adapterWith(BOT_TOKEN);
    const params = new URLSearchParams(freshFields());
    expect(adapter.verifyInitData(params.toString(), NOW)).toBeNull();
  });

  it('refuses a replayed launch, however well signed', () => {
    // A signature never expires by itself. Without this, a launch URL captured
    // from a screenshot or a shared browser history is a permanent key.
    const adapter = adapterWith(BOT_TOKEN);
    const stale = freshFields({
      auth_date: String(Math.floor(NOW.getTime() / 1000) - 60 * 60),
    });
    expect(adapter.verifyInitData(sign(stale), NOW)).toBeNull();
  });

  it('refuses a launch dated in the future beyond ordinary clock drift', () => {
    const adapter = adapterWith(BOT_TOKEN);
    const ahead = freshFields({
      auth_date: String(Math.floor(NOW.getTime() / 1000) + 10 * 60),
    });
    expect(adapter.verifyInitData(sign(ahead), NOW)).toBeNull();
  });

  it('forgives a launch a few seconds ahead of our clock', () => {
    // Two machines, two clocks. Refusing this would fail real claimants for a
    // reason they could never act on.
    const adapter = adapterWith(BOT_TOKEN);
    const ahead = freshFields({
      auth_date: String(Math.floor(NOW.getTime() / 1000) + 20),
    });
    expect(adapter.verifyInitData(sign(ahead), NOW)).toBe('987654321');
  });

  it('verifies nothing when the bot token is not configured', () => {
    // Fail closed. An unconfigured channel must refuse, not accept everything.
    const adapter = adapterWith(undefined);
    expect(adapter.verifyInitData(sign(freshFields()), NOW)).toBeNull();
  });

  it('survives malformed input without throwing', () => {
    const adapter = adapterWith(BOT_TOKEN);
    for (const junk of ['', 'not-a-query-string', 'hash=zz', 'hash=' + 'a'.repeat(64)]) {
      expect(adapter.verifyInitData(junk, NOW)).toBeNull();
    }
  });
});
