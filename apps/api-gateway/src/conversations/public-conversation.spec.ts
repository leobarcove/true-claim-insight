import { PublicConversationProxyController } from './public-conversation.controller';

/**
 * SECURITY TEST — the session token is the key to a conversation.
 *
 * Holding one lets you read and continue a thread. For a visitor that thread
 * belongs to nobody yet; for a Mini App session it names a binding that has a
 * claimant, a case and payout details behind it. So the properties that matter
 * are the same ones a cookie would need: unguessable, unforgeable, and unable
 * to be edited into somebody else's.
 */
const SECRET = 'test-signing-secret';

const controllerWith = () =>
  new PublicConversationProxyController({} as never, {
    get: (key: string) =>
      key === 'jwt.secret' ? SECRET : key === 'INTERNAL_API_KEY' ? 'internal' : undefined,
  } as never);

/** The private surface, reached the way the routes reach it. */
const asInternals = (controller: PublicConversationProxyController) =>
  controller as unknown as {
    issueSession(): string;
    issueChannelSession(platformUserId: string, now?: Date): string;
    sessionIdFrom(token: string | undefined, now?: Date): string | null;
    headers(payload: string): Record<string, string>;
  };

describe('a conversation session cannot be forged', () => {
  it('round-trips a session it issued', () => {
    const c = asInternals(controllerWith());
    const token = c.issueSession();
    expect(c.sessionIdFrom(token)).toBe(token.split('.')[0]);
  });

  it('round-trips a channel session and preserves the platform user', () => {
    const c = asInternals(controllerWith());
    const token = c.issueChannelSession('987654321');
    expect(c.sessionIdFrom(token)).toMatch(/^tg:987654321:\d+$/);
    expect(c.headers(c.sessionIdFrom(token)!)['x-channel-user-id']).toBe('987654321');
  });

  it('refuses a channel session whose user id was edited after signing', () => {
    // The attack the signature exists to stop: take your own valid Mini App
    // session, retarget it at another Telegram user, read their claim.
    const c = asInternals(controllerWith());
    const [payload, signature] = c.issueChannelSession('987654321').split('.');
    const issuedAt = payload.split(':')[2];
    expect(c.sessionIdFrom(`tg:111111111:${issuedAt}.${signature}`)).toBeNull();
  });

  it('expires a channel session, and refuses one back-dated to extend it', () => {
    // A visitor token names a thread attached to nobody. This one names a
    // binding with a claimant, a case and payout details behind it, so it must
    // not sit in localStorage for ever. The timestamp is inside the signed
    // payload precisely so it cannot be pushed forward by editing the token.
    const c = asInternals(controllerWith());
    const issued = new Date('2026-08-18T08:00:00Z');
    const token = c.issueChannelSession('987654321', issued);

    expect(c.sessionIdFrom(token, new Date('2026-08-18T19:00:00Z'))).not.toBeNull();
    expect(c.sessionIdFrom(token, new Date('2026-08-19T09:00:00Z'))).toBeNull();

    const [payload, signature] = token.split('.');
    const later = payload.replace(/:\d+$/, `:${Math.floor(Date.now() / 1000)}`);
    expect(c.sessionIdFrom(`${later}.${signature}`)).toBeNull();
  });

  it('does not expire a visitor session, which names nothing yet', () => {
    const c = asInternals(controllerWith());
    const token = c.issueSession();
    expect(c.sessionIdFrom(token, new Date('2030-01-01T00:00:00Z'))).not.toBeNull();
  });

  it('refuses a payload promoted to a channel session', () => {
    // A visitor session is an unverified thread. Re-prefixing one must not turn
    // it into a claim-bearing identity, because the prefix is signed with it.
    const c = asInternals(controllerWith());
    const [id, signature] = c.issueSession().split('.');
    expect(c.sessionIdFrom(`tg:${id}.${signature}`)).toBeNull();
  });

  it('refuses tokens signed with a different secret, and malformed ones', () => {
    const c = asInternals(controllerWith());
    const other = asInternals(
      new PublicConversationProxyController({} as never, {
        get: (key: string) => (key === 'jwt.secret' ? 'a-different-secret' : undefined),
      } as never)
    );
    expect(c.sessionIdFrom(other.issueChannelSession('987654321'))).toBeNull();

    for (const junk of [undefined, '', 'no-dot', 'tg:1.', '.abc', 'tg:1.zz']) {
      expect(c.sessionIdFrom(junk as string)).toBeNull();
    }
  });
});

describe('a verified payload routes to the right identity downstream', () => {
  it('sends a visitor session as a web session', () => {
    const c = asInternals(controllerWith());
    const headers = c.headers('a1b2c3');
    expect(headers['x-web-session-id']).toBe('a1b2c3');
    expect(headers['x-channel']).toBeUndefined();
  });

  it('sends a channel session as a channel identity', () => {
    // case-service branches on these: a web session upserts a WEB_CHAT binding,
    // a channel identity resolves an existing one and refuses to create it. Get
    // this wrong and a Telegram claimant silently starts a second, empty claim.
    const c = asInternals(controllerWith());
    const headers = c.headers('tg:987654321:1755500000');
    expect(headers['x-channel']).toBe('TELEGRAM');
    expect(headers['x-channel-user-id']).toBe('987654321');
    expect(headers['x-web-session-id']).toBeUndefined();
  });

  it('carries the internal key either way', () => {
    const c = asInternals(controllerWith());
    expect(c.headers('a1b2c3')['x-internal-key']).toBe('internal');
    expect(c.headers('tg:1:1755500000')['x-internal-key']).toBe('internal');
  });
});
