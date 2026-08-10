import { unwrapEnvelope } from './unwrap-envelope';

/**
 * Guards the proxy unwrap.
 *
 * The bug this replaced returned the envelope whenever the payload was falsy,
 * so a claim with no quantum worksheet handed the portal `{success, data, meta}`
 * where it expected `null`. The panel read `.lines` off it and took the whole
 * claim page down with it — a crash on the common case, from a nullish check.
 */
describe('unwrapEnvelope', () => {
  const envelope = (data: unknown) => ({ success: true, data, meta: { requestId: 'req-1' } });

  it('returns null when the payload is null', () => {
    // The case that broke: absent is a real answer, not a missing one.
    expect(unwrapEnvelope(envelope(null))).toBeNull();
  });

  it.each([
    ['empty string', ''],
    ['zero', 0],
    ['false', false],
    ['empty array', []],
  ])('preserves a falsy payload — %s', (_label, payload) => {
    expect(unwrapEnvelope(envelope(payload))).toEqual(payload);
  });

  it('returns the payload when there is one', () => {
    const worksheet = { revision: 2, lines: [{ key: 'loss', amount: '1000.00' }] };
    expect(unwrapEnvelope(envelope(worksheet))).toEqual(worksheet);
  });

  it('never returns the envelope itself', () => {
    const result = unwrapEnvelope(envelope(null)) as any;
    expect(result?.meta).toBeUndefined();
    expect(result?.success).toBeUndefined();
  });

  it('passes through a body that is not an envelope', () => {
    // Not every downstream response is wrapped — a raw array must survive.
    const raw = [{ id: 'a' }, { id: 'b' }];
    expect(unwrapEnvelope(raw)).toEqual(raw);
  });

  it('does not mistake a payload that happens to have a data key', () => {
    // `{ data: ... }` without `success` is not our envelope shape.
    const payload = { data: 'inner' };
    expect(unwrapEnvelope(payload)).toEqual(payload);
  });

  it('tolerates null and undefined bodies', () => {
    expect(unwrapEnvelope(null)).toBeNull();
    expect(unwrapEnvelope(undefined)).toBeUndefined();
  });
});
