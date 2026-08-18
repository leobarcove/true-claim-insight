import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import { HttpException } from '@nestjs/common';
import { of, throwError, firstValueFrom } from 'rxjs';

import { passThroughDownstreamError } from './proxy-error';

/**
 * ARCHITECTURE TEST — the edge must not swallow a downstream answer.
 *
 * Every route the portal calls is proxied. An axios rejection is not an
 * `HttpException`, so a proxy that does not translate it reports 500 and the
 * real answer is lost. Six controllers had no translation and a seventh
 * rethrew the raw error, so every downstream 400, 403 and 404 on those routes
 * surfaced as an internal server error (18 Aug 2026 audit).
 *
 * That is worse than a confusing message. `shouldAudit` keys on the status, so
 * a refused cross-tenant read arriving as a 500 was never recorded: the control
 * looked present because the service raised the right exception, while the edge
 * discarded it. This scans instead of trusting review.
 */
describe('passThroughDownstreamError', () => {
  it('carries the downstream status and body out unchanged', async () => {
    const downstream = {
      response: { status: 404, data: { message: 'Claim not found' } },
    };

    const error = (await firstValueFrom(
      throwError(() => downstream).pipe(passThroughDownstreamError('unavailable'))
    ).catch(e => e)) as HttpException;

    expect(error).toBeInstanceOf(HttpException);
    expect(error.getStatus()).toBe(404);
    expect(error.getResponse()).toEqual({ message: 'Claim not found' });
  });

  it('falls back to 500 only when there was no response at all', async () => {
    const error = (await firstValueFrom(
      throwError(() => new Error('ECONNREFUSED')).pipe(
        passThroughDownstreamError('The service is unavailable')
      )
    ).catch(e => e)) as HttpException;

    expect(error.getStatus()).toBe(500);
    expect(error.getResponse()).toBe('The service is unavailable');
  });

  it('leaves a successful response alone', async () => {
    await expect(
      firstValueFrom(of({ ok: true }).pipe(passThroughDownstreamError('unavailable')))
    ).resolves.toEqual({ ok: true });
  });
});

describe('every proxy controller translates downstream errors', () => {
  const GATEWAY_SRC = join(__dirname, '..');

  const controllers = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...controllers(full));
      else if (entry.endsWith('.controller.ts')) out.push(full);
    }
    return out;
  };

  const proxies = controllers(GATEWAY_SRC)
    .map(file => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(({ source }) => /this\.httpService\s*\n?\s*\./.test(source))
    .map(({ file, source }) => ({
      name: relative(join(GATEWAY_SRC, '..'), file).split(sep).join('/'),
      calls: (source.match(/this\.httpService\s*\n?\s*\.\s*(get|post|put|patch|delete)\(/g) ?? [])
        .length,
      translations: (
        source.match(/passThroughDownstreamError|catchError|this\.unwrap\(/g) ?? []
      ).length,
    }));

  it('finds the proxies, so a passing run means something', () => {
    expect(proxies.length).toBeGreaterThan(5);
  });

  it.each(proxies.map(p => [p.name, p]))('%s', (_name, proxy: any) => {
    // Not a count-for-count match: a controller may route several calls through
    // one private helper. What must never happen is a proxy with outbound calls
    // and no translation anywhere in the file.
    expect({ calls: proxy.calls, translated: proxy.translations > 0 }).toEqual({
      calls: proxy.calls,
      translated: true,
    });
  });
});
