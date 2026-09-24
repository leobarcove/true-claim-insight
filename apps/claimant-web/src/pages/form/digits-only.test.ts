import type { FlowStep } from '@tci/shared-types';
import { describe, expect, it } from 'vitest';

import { acceptsDigitsOnly, keepDigits } from './digits-only';

const step = (over: Partial<FlowStep>): FlowStep =>
  ({ id: 's', label: 's', answerType: 'text', ...over }) as FlowStep;

describe('which fields refuse letters', () => {
  it('recognises a bank account number from its own rule', () => {
    expect(acceptsDigitsOnly(step({ validation: { pattern: '^[0-9]{6,20}$' } }))).toBe(true);
  });

  it.each(['^[0-9]+$', '^[0-9]*$', '^[0-9]{4,}$'])('accepts %s', pattern => {
    expect(acceptsDigitsOnly(step({ validation: { pattern } }))).toBe(true);
  });

  /**
   * The cost of a false positive is a claimant whose keyboard silently stops
   * working on a field that was never digits-only — so anything that merely
   * *contains* digits is left alone.
   */
  it.each([
    '^[A-Z]{2}[0-9]{1,4}$', // flight number: MH88
    '^[0-9A-Z-]+$', // policy number
    '^.+$',
    '^[0-9]{2}-[0-9]{7}$', // digits, but also a dash
    '^\\d{6}$', // digits, but not a shape any flow writes
  ])('leaves %s alone', pattern => {
    expect(acceptsDigitsOnly(step({ validation: { pattern } }))).toBe(false);
  });

  it('leaves a field with no rule alone', () => {
    expect(acceptsDigitsOnly(step({}))).toBe(false);
  });

  /** Dates, phones and amounts have their own input types already. */
  it.each(['date', 'datetime', 'phone', 'number', 'choice', 'document'] as const)(
    'does not touch a %s step',
    answerType => {
      expect(
        acceptsDigitsOnly(step({ answerType, validation: { pattern: '^[0-9]+$' } }))
      ).toBe(false);
    }
  );
});

describe('what survives typing or pasting', () => {
  it('drops letters and symbols', () => {
    expect(keepDigits('123123123x')).toBe('123123123');
    expect(keepDigits('1234-5678 90')).toBe('1234567890');
  });

  /** A pasted account number off a bank statement arrives with spaces. */
  it('keeps a pasted number usable', () => {
    expect(keepDigits('5141 2345 6789')).toBe('514123456789');
  });

  it('leaves a clean number untouched', () => {
    expect(keepDigits('114233892201')).toBe('114233892201');
  });
});
