import { describe, expect, it } from 'vitest';

import { asDateAndTime, asTime } from './when';

/**
 * The consent instant is the server's, and these are the only two places it is
 * turned into words. It is shown back to an agent who may repeat it to the
 * claimant, so a value that cannot be read must not be printed as if it could.
 */
describe('showing when consent was attested', () => {
  const iso = '2026-08-14T03:07:00.000Z'; // 11:07 in Malaysia

  it('gives the band a time', () => {
    expect(asTime(iso)).toMatch(/^\d{2}:\d{2}$/);
  });

  it('gives the receipt a date as well, since it may be read back later', () => {
    expect(asDateAndTime(iso)).toMatch(/Aug 2026/);
  });

  /**
   * Rather than "Invalid Date", which reads as a system fault, or an empty
   * string, which leaves a dangling separator beside it.
   */
  it('shows an unreadable value as it came, rather than inventing one', () => {
    expect(asTime('not a date')).toBe('not a date');
    expect(asDateAndTime('')).toBe('');
  });
});
