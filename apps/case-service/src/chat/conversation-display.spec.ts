import { readFileSync } from 'fs';
import { join } from 'path';

import {
  CONSENT_AGREED_VALUE,
  describeCallbackValue,
  EDIT_CALLBACK_PREFIX,
  PAGE_CALLBACK_PREFIX,
  SHARED_PHONE_DESCRIPTION,
} from '@tci/shared-types';

/**
 * The transcript has to record what the claimant chose.
 *
 * The defect this pins against recurring: `handleTurn` persisted only
 * `payload.text`, but a tapped button arrives as `callbackValue` and a shared
 * contact as `sharedPhone`. Every tap — claim type, consent agreement,
 * cancellation reason, the review confirmation — stored NULL, and the operator
 * inbox rendered "—". The conversation went blank at exactly the points where
 * the claimant made a decision, which is also where a dispute starts.
 */
describe('describeCallbackValue', () => {
  it('prefers the wording that was actually on the button', () => {
    const choices = [
      { value: 'ILLNESS', label: 'Illness or injury' },
      { value: 'DEATH_OF_RELATIVE', label: 'Death of a relative' },
    ];
    expect(describeCallbackValue('ILLNESS', choices)).toBe('Illness or injury');
  });

  it('names the synthetic buttons the gateway invents', () => {
    expect(describeCallbackValue(CONSENT_AGREED_VALUE)).toBe('Agreed to the privacy notice');
    expect(describeCallbackValue(`${PAGE_CALLBACK_PREFIX}2`)).toBe('Asked for more options');
    expect(describeCallbackValue(`${EDIT_CALLBACK_PREFIX}flight-number`)).toBe(
      'Chose to change "flight-number"'
    );
  });

  it('reads the review step\'s confirm and decline', () => {
    expect(describeCallbackValue('true')).toBe('Confirmed');
    expect(describeCallbackValue('false')).toBe('Asked to change something');
  });

  it('labels a claim type chosen from the opening menu', () => {
    // A synthetic step with no choices list of its own, so the label can only
    // come from the shared map.
    expect(describeCallbackValue('FLIGHT_DELAY')).toBe('Flight delay');
  });

  it('returns the raw value rather than nothing when it recognises neither', () => {
    // Total by design: an unknown value in a transcript is worse than its
    // label and far better than a dash — a reader can still tell what was
    // chosen, which is the whole point of the record.
    expect(describeCallbackValue('SOME_AUTHORED_VALUE')).toBe('SOME_AUTHORED_VALUE');
  });

  it('distinguishes "nothing was tapped" from a value', () => {
    expect(describeCallbackValue(null)).toBeNull();
    expect(describeCallbackValue(undefined)).toBeNull();
    expect(describeCallbackValue('')).toBeNull();
  });
});

describe('the gateway records what a turn carried', () => {
  // Source scan, the same pattern as the retention and audit-scope suites: the
  // three shapes a turn can arrive in must all reach the transcript. A unit
  // test cannot catch a field quietly dropped from a Prisma create.
  const source = readFileSync(join(__dirname, 'conversation.gateway.ts'), 'utf8');

  it('persists the tapped value, not only typed text', () => {
    expect(source).toContain('callbackValue: payload.callbackValue ?? null');
  });

  it('gives a tap and a shared contact readable text at insert', () => {
    expect(source).toContain('describeCallbackValue(payload.callbackValue)');
    expect(source).toContain('SHARED_PHONE_DESCRIPTION');
  });

  it('stores a marker for a shared contact rather than the number itself', () => {
    // This column is neither encrypted nor swept by the anonymisation job, so
    // a transcript must not become a second copy of personal data.
    expect(SHARED_PHONE_DESCRIPTION).not.toMatch(/\d/);
    expect(source).not.toContain('text: payload.sharedPhone');
  });
});
