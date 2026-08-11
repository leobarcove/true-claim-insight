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
      for (const match of source.matchAll(/@Throttle\(\{\s*([A-Za-z_][\w]*)\s*:/g)) {
        if (!configured.has(match[1])) {
          dangling.push(`${file.replace(SRC, '')} → "${match[1]}"`);
        }
      }
    }
    expect(dangling).toEqual([]);
  });
});
