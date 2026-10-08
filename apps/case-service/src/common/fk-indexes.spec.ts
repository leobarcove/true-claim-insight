import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Every foreign key is the leading column of some index.
 *
 * Postgres does not index the referencing side of a foreign key, and Prisma
 * does not add one either, so an unindexed relation turns every join or filter
 * on it — and every delete of a parent row, which must check for children —
 * into a scan of the child table. The audit of 8 Oct 2026 found 27 such keys,
 * some on hot paths (the insurer's claim-access rule filters on
 * Claim.insurerTenantId).
 *
 * Read from the schema rather than a hand-kept list, the same way
 * `sensitive-fields.spec.ts` does, so a new relation without an index fails
 * here instead of in a slow query months later.
 */
describe('every foreign key has a supporting index', () => {
  const SCHEMA = join(__dirname, '../../../../packages/prisma-client/prisma/schema.prisma');
  const schema = readFileSync(SCHEMA, 'utf8');

  /** `Model.field` for each relation whose first column leads no index. */
  const unindexed = (): string[] => {
    const missing: string[] = [];
    for (const [, model, body] of schema.matchAll(/\nmodel (\w+) \{([\s\S]*?)\n\}/g)) {
      const leading = new Set<string>();
      for (const [, columns] of body.matchAll(/@@(?:index|unique|id)\(\[([^\]]+)\]/g)) {
        leading.add(columns.split(',')[0].trim().split('(')[0]);
      }
      for (const line of body.split('\n')) {
        const field = line.trim().split(/\s+/)[0];
        if (field && (/@id\b/.test(line) || /@unique\b/.test(line))) leading.add(field);
      }
      for (const [, fields] of body.matchAll(/@relation\([^)]*fields:\s*\[([^\]]+)\]/g)) {
        const first = fields.split(',')[0].trim();
        if (!leading.has(first)) missing.push(`${model}.${first}`);
      }
    }
    return missing;
  };

  it('finds the relations it is checking (guards against a parser that silently matches nothing)', () => {
    expect(schema.match(/@relation\([^)]*fields:/g)?.length ?? 0).toBeGreaterThan(100);
  });

  it('has no foreign key without an index — add @@index([field]) to the model', () => {
    expect(unindexed()).toEqual([]);
  });
});
