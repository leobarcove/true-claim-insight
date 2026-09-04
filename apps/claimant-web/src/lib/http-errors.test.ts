import { describe, expect, it } from 'vitest';

import { isRateLimited } from './http-errors';

/**
 * Which failures get different advice.
 *
 * Retrying a rate limit spends the same allowance again, so telling somebody to
 * "please try again" is what turns a two-minute wait into ten. Everything else
 * is worth retrying, and must not be mistaken for a limit — a real outage
 * silently reported as "you are going too fast" leaves them waiting for a
 * window that was never the problem.
 */
describe('is this the throttle, or a genuine failure', () => {
  it('recognises the throttle', () => {
    expect(isRateLimited({ response: { status: 429 } })).toBe(true);
  });

  it.each([400, 401, 403, 404, 500, 503])('leaves %i alone', status => {
    expect(isRateLimited({ response: { status } })).toBe(false);
  });

  /** A network failure has no response at all, and is worth retrying. */
  it('is not confused by an error with no response', () => {
    expect(isRateLimited(new Error('Network Error'))).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });
});
