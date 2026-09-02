import { describe, expect, it } from 'vitest';

import { formatNric, isCompleteNric } from './nric';

describe('typing an IC number', () => {
  it('groups it the way it is written on the card', () => {
    expect(formatNric('981010101010')).toBe('981010-10-1010');
  });

  it('groups as it goes, so the shape is visible while typing', () => {
    expect(formatNric('9810')).toBe('9810');
    expect(formatNric('981010')).toBe('981010');
    expect(formatNric('98101010')).toBe('981010-10');
    expect(formatNric('9810101010')).toBe('981010-10-10');
  });

  /** The reported problem: thirteen digits went in and were accepted. */
  it('stops at twelve digits', () => {
    expect(formatNric('9810101010109999')).toBe('981010-10-1010');
  });

  it('takes an IC pasted with its dashes already in', () => {
    expect(formatNric('880101-14-5555')).toBe('880101-14-5555');
  });

  it('ignores letters and stray punctuation', () => {
    expect(formatNric('88x0101 14/5555')).toBe('880101-14-5555');
  });

  /** Deleting has to work: re-adding a dash the moment one is removed traps the cursor. */
  it('lets a digit be deleted', () => {
    expect(formatNric('981010-10-101')).toBe('981010-10-101');
    expect(formatNric('981010-1')).toBe('981010-1');
  });
});

describe('whether an IC is finished', () => {
  it('accepts a complete one', () => {
    expect(isCompleteNric('981010-10-1010')).toBe(true);
  });

  /** Optional here — the claimant may not have their card to hand. */
  it('accepts none at all', () => {
    expect(isCompleteNric('')).toBe(true);
  });

  /**
   * The one to catch. A partial IC hashes to something that matches no
   * existing claimant, so it silently creates a second record for somebody we
   * already hold — and the two are not obviously the same person afterwards.
   */
  it('refuses a half-typed one', () => {
    expect(isCompleteNric('981010-10')).toBe(false);
    expect(isCompleteNric('98')).toBe(false);
  });
});
