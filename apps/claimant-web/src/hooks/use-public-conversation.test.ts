import { describe, expect, it } from 'vitest';

import { adoptPublicSession, clearPublicSession, isChannelSession } from './use-public-conversation';

/**
 * Which kind of session this browser is holding.
 *
 * Small, but it is the input to a destructive decision: `startOver` clears the
 * session, and on a Telegram Mini App session that means abandoning the claim
 * the claimant has been building with the bot. Everything downstream trusts
 * this function to tell the two apart.
 */
describe('telling a channel session from a visitor session', () => {
  it('is false when this browser holds no session at all', () => {
    expect(isChannelSession()).toBe(false);
  });

  it('is false for a visitor session', () => {
    // The shape the gateway issues for someone who opened the public link:
    // a uuid naming a thread that belongs to nobody yet.
    adoptPublicSession('7c9e6679-7425-40de-944b-e07fc1f90ae7.a1b2c3');
    expect(isChannelSession()).toBe(false);
  });

  it('is true for a Telegram session', () => {
    adoptPublicSession('tg:987654321:1787034567.a1b2c3');
    expect(isChannelSession()).toBe(true);
  });

  it('goes back to false once the session is cleared', () => {
    adoptPublicSession('tg:987654321:1787034567.a1b2c3');
    clearPublicSession();
    expect(isChannelSession()).toBe(false);
  });

  it('reads the same key `adoptPublicSession` writes', () => {
    // The two live in this module precisely so the key is spelled once. A test
    // that asserted the literal string would defeat that; this asserts they
    // agree with each other instead.
    adoptPublicSession('tg:1:2.sig');
    expect(isChannelSession()).toBe(true);
  });
});
