import { describe, expect, it } from 'vitest';

import { copy, copyFor } from './form-copy';

/**
 * The form's own wording, and the one rule that keeps it honest.
 *
 * A missing translation must read as English, not as a blank or a key. A form
 * that renders "submit.button" or an empty button is broken in a way that looks
 * like a bug in the claim, and the claimant has no way to tell the difference.
 */
describe('form copy', () => {
  it('reads English', () => {
    expect(copy('en', 'continue')).toBe('Continue');
  });

  it('reads Malay where a translation exists', () => {
    expect(copy('ms', 'continue')).toBe('Teruskan');
  });

  /**
   * The important one. The Malay table is deliberately partial — no Malay
   * wording exists for the questions yet, so the translation lands a phrase at
   * a time. Every gap has to fall back to something a person can read.
   */
  it('falls back to English for anything not yet translated', () => {
    expect(copy('ms', 'submittedChecking')).toBe(copy('en', 'submittedChecking'));
  });

  it('never returns an empty string', () => {
    const keys = ['continue', 'submit', 'agree', 'tooFast', 'submittedTitle'] as const;
    for (const locale of ['en', 'ms'] as const) {
      for (const key of keys) {
        expect(copy(locale, key).trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('binds to a locale once', () => {
    const t = copyFor('ms');
    expect(t('back')).toBe('Kembali');
    expect(t('saving')).toBe(copy('en', 'saving'));
  });
});
