import type { FlowStep } from '@tci/shared-types';

/**
 * Whether a text step accepts digits and nothing else.
 *
 * Read from the step's own validation rather than a list of field ids, so a new
 * digits-only question behaves correctly the day it is added and this never
 * drifts from what the server will actually accept.
 *
 * Deliberately narrow. It recognises the one shape the flows actually use —
 * `[0-9]` spanning the whole string, with or without a length bound — and says
 * no to everything else, `\d` included. Guessing wrong in the permissive direction costs nothing; guessing
 * wrong the other way silently eats characters out of a valid answer, and the
 * claimant cannot tell why their keyboard has stopped working.
 */
const WHOLE_STRING_OF_DIGITS = /^\^\[0-9\]([*+]|\{\d+(,\d*)?\})?\$$/;

export function acceptsDigitsOnly(step: FlowStep): boolean {
  if (step.answerType !== 'text') return false;
  const pattern = step.validation?.pattern;
  return typeof pattern === 'string' && WHOLE_STRING_OF_DIGITS.test(pattern);
}

/** Everything that is not a digit, removed. Also what a paste goes through. */
export function keepDigits(value: string): string {
  return value.replace(/\D/g, '');
}
