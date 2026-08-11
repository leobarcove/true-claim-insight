import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * COMPLIANCE-ADJACENT TEST — a rate limit that names nothing limits nothing.
 *
 * `@Throttle({ someName: … })` overrides the throttler *called* `someName`. If
 * no throttler by that name is configured the decorator does nothing, and it
 * fails silently: the route still reads as protected, and only comparing two
 * files nobody reads together would reveal otherwise. The api-gateway shipped
 * five such routes, including the OTP send limit.
 *
 * This is the case-service copy. It differs from the gateway's in one way that
 * matters: it reads *every* name in a decorator, not just the first.
 * `@Throttle({ short: …, medium: … })` is a single decorator with two
 * overrides, and a version that stops at `short` would wave through a dangling
 * `medium` — precisely the class of miss the test exists to prevent.
 */
const SRC = join(__dirname, '..');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });

/** Every throttler name overridden in one `@Throttle({ … })` call. */
export const throttlerNamesIn = (source: string): string[] => {
  const names: string[] = [];
  for (const call of source.matchAll(/@Throttle\(\s*\{([\s\S]*?)\}\s*\)/g)) {
    // A name is a key whose value is an object — `short: { limit, ttl }`.
    // `limit` and `ttl` are keys too, but their values are numbers, so this
    // distinguishes the two without parsing.
    for (const key of call[1].matchAll(/([A-Za-z_]\w*)\s*:\s*\{/g)) {
      names.push(key[1]);
    }
  }
  return names;
};

describe('every @Throttle names a throttler that exists', () => {
  const configured = new Set(
    [...readFileSync(join(SRC, 'app.module.ts'), 'utf8').matchAll(/name:\s*'([^']+)'/g)].map(
      match => match[1]
    )
  );

  it('finds the configured throttlers', () => {
    expect(configured.size).toBeGreaterThan(0);
  });

  it('reads every name in a multi-override decorator, not just the first', () => {
    // Guards the guard. A regex that stopped at the first key would return
    // ['short'] here and quietly pass a dangling second name for ever.
    expect(throttlerNamesIn('@Throttle({ short: { limit: 5, ttl: 1000 }, nope: { limit: 1 } })'))
      .toEqual(['short', 'nope']);
  });

  it('has no override pointing at a throttler that was never configured', () => {
    const dangling: string[] = [];
    for (const file of walk(SRC)) {
      for (const name of throttlerNamesIn(readFileSync(file, 'utf8'))) {
        if (!configured.has(name)) dangling.push(`${file.replace(SRC, '')} → "${name}"`);
      }
    }
    expect(dangling).toEqual([]);
  });
});
