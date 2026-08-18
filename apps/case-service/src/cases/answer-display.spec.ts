import { readFileSync } from 'fs';
import { join } from 'path';

import {
  AIRLINE_CHOICES,
  BANK_CHOICES,
  CASE_FLOWS,
  DEFER_VALUE,
  DESTINATION_CHOICES,
  displayAnswer,
  getStep,
  SKIP_VALUE,
  summariseAnswers,
} from '@tci/shared-types';

/**
 * REGRESSION TEST — staff and claimant must read the same answer the same way.
 *
 * The bot's review summary resolved a choice through the step's own `choices`,
 * so a claimant read "Singapore" and "Batik Air Malaysia". The adjuster's case
 * detail formatted answers itself and put the stored value through a
 * title-caser, so staff read "Sg" and "Od".
 *
 * That is not a cosmetic difference. Those are ISO 3166 and IATA codes, chosen
 * as stored values because they are unambiguous to *machines* — printing them
 * raw put the abbreviation problem ("SG", "MAS", "CIMB") straight back in front
 * of the people the lists were meant to protect from it, and made it worse:
 * "Od" is not a guess anyone can make.
 *
 * The drift was invisible until two screens were compared side by side. So the
 * rule lives in one function, and this asserts nothing re-implements it.
 */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

describe('a coded answer is shown as its label, never as the code', () => {
  const flow = CASE_FLOWS.FLIGHT_DELAY;

  it.each([
    ['destination', 'SG', 'Singapore'],
    ['airline', 'OD', 'Batik Air Malaysia'],
    ['bank-name', 'CIMB', 'CIMB Bank'],
  ])('%s: %s reads as %s', (stepId, stored, expected) => {
    const step = getStep(flow, stepId)!;
    expect(displayAnswer(step, stored)).toBe(expected);
  });

  it('shows a typed answer exactly as it was typed', () => {
    // `allowOther` means an answer can legitimately be off-list. Re-capitalising
    // it would be a second way of not showing what the claimant wrote.
    const step = getStep(flow, 'airline')!;
    expect(displayAnswer(step, 'Bank of Bhutan Air')).toBe('Bank of Bhutan Air');
  });

  it('every published code resolves to a label', () => {
    // A list entry with no label is a code that would reach staff raw.
    for (const list of [AIRLINE_CHOICES, BANK_CHOICES, DESTINATION_CHOICES]) {
      for (const choice of list) {
        expect(choice.label.trim().length).toBeGreaterThan(0);
        expect(choice.label).not.toBe(choice.value);
      }
    }
  });
});

describe('the two screens agree by construction', () => {
  it('the review summary is built from the same function', () => {
    const flow = CASE_FLOWS.FLIGHT_DELAY;
    const answers = { destination: 'SG', airline: 'OD', 'bank-name': 'CIMB' };
    const summary = summariseAnswers(flow.steps, answers);

    for (const [stepId, value] of Object.entries(answers)) {
      const step = getStep(flow, stepId)!;
      expect(summary).toContain(`${step.label}: ${displayAnswer(step, value)}`);
    }
  });

  it('the case detail does not format answers itself', () => {
    // The specific regression: `convertToTitleCase(value)` on a choice answer.
    const details = readFileSync(
      join(REPO_ROOT, 'apps/adjuster-portal/src/pages/cases/details.tsx'),
      'utf8'
    );
    expect(details).toContain('displayAnswer(step, value)');
    expect(details).not.toMatch(/answerType === 'choice'\s*\n?\s*\?\s*convertToTitleCase/);
  });
});

describe('the sentinels stay readable', () => {
  it.each([
    [SKIP_VALUE, 'not provided'],
    [DEFER_VALUE, 'to be sent later'],
  ])('%s reads as "%s"', (stored, expected) => {
    const step = getStep(CASE_FLOWS.FLIGHT_DELAY, 'doc-boarding-pass')!;
    expect(displayAnswer(step, stored)).toBe(expected);
  });

  it('an uploaded document reads as provided, not as its id', () => {
    const step = getStep(CASE_FLOWS.FLIGHT_DELAY, 'doc-boarding-pass')!;
    expect(displayAnswer(step, 'ckd9x2p0a0001')).toBe('provided');
  });
});
