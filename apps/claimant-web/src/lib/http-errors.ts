/**
 * Recognising the one failure that needs different advice.
 *
 * A rate limit is not a fault and retrying makes it worse — each attempt counts
 * against the same allowance, so "please try again" is advice that keeps
 * somebody locked out for longer. Everything else genuinely is worth retrying.
 *
 * The status is the whole signal: the throttle answers 429 and carries no body
 * of its own, so there is nothing else to read.
 */
export function isRateLimited(error: unknown): boolean {
  return (error as { response?: { status?: number } })?.response?.status === 429;
}
