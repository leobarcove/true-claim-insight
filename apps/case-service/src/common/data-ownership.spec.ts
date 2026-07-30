import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import {
  MODEL_OWNERSHIP,
  OWNERSHIP_EXCEPTIONS,
  SERVICE_CONTEXTS,
  checkOwnership,
} from '@tci/prisma-client';

/**
 * ARCHITECTURE TEST — data ownership (docs/MASTER_PLAN.md §4.3 A2).
 *
 * Four NestJS services share one database, so by default any service can write
 * any table. That already happened: video-service writes `claim`, risk-engine
 * writes `document` and `floodClaim`. The failure mode is a schema change
 * silently breaking three services, with no owner to reason about invariants.
 *
 * This test scans every service's source for Prisma write calls and fails when
 * one crosses a bounded-context boundary. It runs statically in CI, so a new
 * violation is caught at review time rather than in production.
 *
 * The exception list is a **ratchet**: it may shrink, never grow. Removing an
 * entry means the violation was actually fixed.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const WRITE_CALL = /prisma\.([a-zA-Z]+)\.(create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany)\b/g;

const sourceFiles = (dir: string): string[] => {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === 'venv') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) out.push(full);
  }
  return out;
};

interface Violation {
  service: string;
  model: string;
  operation: string;
  file: string;
}

const scan = (): Violation[] => {
  const violations: Violation[] = [];

  for (const service of Object.keys(SERVICE_CONTEXTS)) {
    for (const file of sourceFiles(join(REPO_ROOT, 'apps', service, 'src'))) {
      const contents = readFileSync(file, 'utf8');
      for (const [, model, operation] of contents.matchAll(WRITE_CALL)) {
        const verdict = checkOwnership(service, model, operation);
        if (!verdict.allowed || verdict.viaException) {
          violations.push({
            service,
            model,
            operation,
            file: file.replace(`${REPO_ROOT}/`, ''),
          });
        }
      }
    }
  }
  return violations;
};

describe('data ownership across services', () => {
  const violations = scan();

  it('actually scanned the repository (guards against a vacuous pass)', () => {
    // If REPO_ROOT ever resolves wrongly the scan returns nothing and every
    // other assertion here passes for the wrong reason. Anchor on violations we
    // know exist today and have declared as exceptions.
    const seen = violations.map(v => `${v.service}:${v.model}`);

    expect(seen).toContain('video-service:claim');
    expect(seen).toContain('risk-engine:document');
    expect(sourceFiles(join(REPO_ROOT, 'apps', 'case-service', 'src')).length).toBeGreaterThan(20);
  });

  it('has no undeclared cross-context writes', () => {
    const undeclared = violations.filter(
      v => !checkOwnership(v.service, v.model, v.operation).allowed
    );

    // A readable failure matters here: whoever trips this needs to know which
    // service reached into which table, and where.
    const detail = undeclared
      .map(v => `  ${v.service} → ${v.model}.${v.operation}  (${v.file})`)
      .join('\n');

    expect(detail).toBe('');
    expect(undeclared).toHaveLength(0);
  });

  it('declares an owner for every model that is written anywhere', () => {
    const orphans = violations
      .filter(v => !MODEL_OWNERSHIP[v.model])
      .map(v => `${v.model} (written by ${v.service})`);

    expect([...new Set(orphans)]).toEqual([]);
  });

  it('keeps the legacy exception list from growing (ratchet)', () => {
    // Update this number ONLY downwards, and only alongside the code change
    // that removed the violation. See OWNERSHIP_EXCEPTIONS for each resolution.
    const MAX_KNOWN_VIOLATIONS = 6;

    expect(OWNERSHIP_EXCEPTIONS.length).toBeLessThanOrEqual(MAX_KNOWN_VIOLATIONS);
  });

  it('gives every declared exception a concrete resolution', () => {
    for (const exception of OWNERSHIP_EXCEPTIONS) {
      expect(exception.reason.length).toBeGreaterThan(20);
      expect(exception.resolution.length).toBeGreaterThan(20);
      expect(MODEL_OWNERSHIP[exception.model]).toBeDefined();
      expect(SERVICE_CONTEXTS[exception.service]).toBeDefined();
    }
  });

  it('permits reads across contexts (coupling, not corruption)', () => {
    expect(checkOwnership('video-service', 'claim', 'findUnique').allowed).toBe(true);
    expect(checkOwnership('video-service', 'claim', 'findMany').allowed).toBe(true);
  });

  it('blocks a service writing a table it does not own', () => {
    // Guards the guard: if this passes when it should not, the whole test is void.
    const verdict = checkOwnership('video-service', 'policy', 'update');

    expect(verdict.allowed).toBe(false);
    expect(verdict.reason).toContain('belongs to the "claims" context');
  });
});
