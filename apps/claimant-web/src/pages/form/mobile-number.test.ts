import { describe, expect, it } from 'vitest';

import { checkMobileNumber, toE164 } from './mobile-number';

/**
 * The one field standing between a claimant and a WhatsApp code.
 *
 * The cases that matter are the ones a real person actually types: their number
 * with the leading zero, their number read off a card with the country code
 * already in it, and a digit short. Each has to come back with something they
 * can act on, because the alternative is a round trip to WhatsApp that ends in
 * a refusal they have waited for.
 */

describe('a Malaysian mobile number, typed under a +60 prefix', () => {
  it('takes the nine-digit form', () => {
    expect(checkMobileNumber('123456789')).toBeNull();
    expect(checkMobileNumber('12 345 6789')).toBeNull();
    expect(checkMobileNumber('12-345 6789')).toBeNull();
  });

  it('takes the ten-digit 011 range', () => {
    expect(checkMobileNumber('1123456789')).toBeNull();
    expect(checkMobileNumber('011 2345 6789')).toBeNull();
  });

  it('takes a leading zero, because that is how the number is written down', () => {
    expect(checkMobileNumber('0123456789')).toBeNull();
    expect(toE164('0123456789')).toBe('+60123456789');
  });

  it('says what is missing rather than that something is', () => {
    expect(checkMobileNumber('')).toBe('Enter your mobile number.');
    expect(checkMobileNumber('   ')).toBe('Enter your mobile number.');
    expect(checkMobileNumber('12345')).toMatch(/too short/);
    expect(checkMobileNumber('12345678901')).toMatch(/too long/);
  });

  it('names the country code rather than eating it', () => {
    // Read off a card: the +60 is already printed beside the box.
    expect(checkMobileNumber('60123456789')).toMatch(/Leave out the 60/);
  });

  it('refuses a landline, which cannot receive WhatsApp from us', () => {
    // 03 is Klang Valley fixed line. Nine digits, so only the leading 1 rules
    // it out — which is the whole reason that check is not a length check.
    expect(checkMobileNumber('0312345678')).toMatch(/starts with 1/);
    expect(checkMobileNumber('312345678')).toMatch(/starts with 1/);
  });

  it('sends the same digits it checked', () => {
    expect(toE164('12 345 6789')).toBe('+60123456789');
    expect(toE164('1123456789')).toBe('+601123456789');
  });
});
