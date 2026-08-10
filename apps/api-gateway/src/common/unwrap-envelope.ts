/**
 * Unwrap a downstream service's response envelope.
 *
 * Every internal service answers in the shape `{ success, data, meta }`. The
 * gateway re-wraps whatever a proxy controller returns, so a proxy must hand
 * back the *payload*, never the envelope — otherwise the client receives
 * `{ data: { success, data, meta } }` and reads the wrong object.
 *
 * The obvious `response.data?.data ?? response.data` is wrong for exactly the
 * case that matters: when the payload is legitimately `null` — no worksheet
 * prepared, no record found — `??` treats it as absent and returns the whole
 * envelope. The client then sees a truthy object that has none of the fields
 * it expects, which is worse than the null it asked for. Decide on the
 * envelope's *shape*, not on whether its contents happen to be nullish.
 */
export function unwrapEnvelope<T = unknown>(body: unknown): T {
  if (isEnvelope(body)) {
    return body.data as T;
  }
  return body as T;
}

function isEnvelope(body: unknown): body is { success: unknown; data: unknown } {
  return (
    typeof body === 'object' &&
    body !== null &&
    !Array.isArray(body) &&
    'success' in body &&
    'data' in body
  );
}
