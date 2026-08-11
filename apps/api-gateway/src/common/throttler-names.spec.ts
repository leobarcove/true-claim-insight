import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * COMPLIANCE-ADJACENT TEST — a rate limit that names nothing limits nothing.
 *
 * `@Throttle({ someName: … })` overrides the throttler called `someName`. If
 * no throttler by that name is configured the decorator is a no-op — and it
 * is a *silent* one, because the route still reads as though it is protected.
 *
 * Five routes carried `@Throttle({ default: … })` against a config that
 * defined only `short`, `medium` and `long`. The tightest limits in the
 * system — five OTP sends an hour, ten logins a minute — had never applied,
 * and the only way to notice was to compare two files nobody reads together.
 */
const SRC = join(__dirname, '..');

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });

describe('every @Throttle names a throttler that exists', () => {
  const configured = new Set(
    [...readFileSync(join(SRC, 'app.module.ts'), 'utf8').matchAll(/name:\s*'([^']+)'/g)].map(
      match => match[1]
    )
  );

  it('configures a throttler called "default"', () => {
    // The name an override defaults to, and the one five routes rely on.
    expect(configured.has('default')).toBe(true);
  });

  it('has no override pointing at a throttler that was never configured', () => {
    const dangling: string[] = [];
    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8');
      // Every name in the decorator, not just the first: `@Throttle({ short: …,
      // medium: … })` is one call carrying two overrides, and stopping at the
      // first would wave the second through — the same silent pass this test
      // was written to catch.
      for (const call of source.matchAll(/@Throttle\(\s*\{([\s\S]*?)\}\s*\)/g)) {
        for (const key of call[1].matchAll(/([A-Za-z_]\w*)\s*:\s*\{/g)) {
          if (!configured.has(key[1])) {
            dangling.push(`${file.replace(SRC, '')} → "${key[1]}"`);
          }
        }
      }
    }
    expect(dangling).toEqual([]);
  });
});
