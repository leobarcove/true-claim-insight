import { ConfigService } from '@nestjs/config';

import { VideoService } from './video.service';

/**
 * COMPLIANCE TEST — every gateway call to video-service carries the internal
 * key (MASTER_PLAN §4.3 A1).
 *
 * `InternalHttpModule` exists so no gateway call site can forget the key. This
 * module bypasses it — it calls with `fetch` and builds its own headers — and
 * so it forgot. video-service fails closed, which is correct, so the whole
 * video path returned 502 "Invalid internal credentials": the Sessions screen,
 * creating a room, joining, ending, and every upload.
 *
 * The test reaches the private builder deliberately. The alternative is
 * asserting on twenty call sites, and the point is that they all funnel
 * through one place — which is the property worth protecting.
 */
describe('video-service client — internal authentication', () => {
  const build = (key?: string) => {
    const config = {
      get: (name: string, fallback?: string) =>
        name === 'INTERNAL_API_KEY' ? key : (fallback ?? 'http://localhost:3002'),
    } as unknown as ConfigService;
    const service = new VideoService(config, {} as never);
    return (service as unknown as {
      buildHeaders(t?: string, u?: string, r?: string): Record<string, string>;
    }).buildHeaders('tenant-1', 'user-1', 'ADJUSTER');
  };

  it('sends the internal key', () => {
    expect(build('secret-key')['x-internal-key']).toBe('secret-key');
  });

  it('still sends the identity headers the downstream guard requires', () => {
    // The guard checks identity before the key; omitting either fails closed.
    const headers = build('secret-key');
    expect(headers['X-Tenant-Id']).toBe('tenant-1');
    expect(headers['X-User-Id']).toBe('user-1');
    expect(headers['X-User-Role']).toBe('ADJUSTER');
  });

  it('refuses to build headers at all when the key is unconfigured', () => {
    // Fail closed at the caller, not only at the receiver. This test once
    // asserted the opposite — that an unconfigured gateway merely *omitted*
    // the key and sent the request anyway, leaving video-service's guard as
    // the only thing standing (10 Aug 2026 audit, finding 7). A misconfigured
    // gateway must refuse loudly with "not configured", never send a
    // credential-less request that logs downstream as "invalid".
    expect(() => build(undefined)).toThrow(/INTERNAL_API_KEY is not configured/);
  });
});
