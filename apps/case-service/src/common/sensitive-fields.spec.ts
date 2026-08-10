import { readFileSync } from 'fs';
import { join } from 'path';
import { SENSITIVE_FIELD_OMIT } from '@tci/prisma-client';

/**
 * COMPLIANCE TEST — no encrypted or hashed personal-data column may reach a
 * response body by default (docs/MASTER_PLAN.md §3.4, PDPA).
 *
 * Encryption at rest is worth nothing if a service loads the ciphertext and
 * hands it to a browser, and the blind index is worse than the ciphertext: it
 * is a deterministic function of the NRIC, so publishing it means a leaked
 * pepper yields the NRIC itself.
 *
 * This test reads the Prisma schema rather than a list maintained by hand, so
 * adding a new encrypted column without adding it to SENSITIVE_FIELD_OMIT fails
 * here instead of leaking silently in production.
 */
describe('SENSITIVE_FIELD_OMIT covers the schema', () => {
  const SCHEMA = join(__dirname, '../../../../packages/prisma-client/prisma/schema.prisma');

  /**
   * Columns that look sensitive by name but are not personal data. Each needs a
   * reason — the point is to make an exemption a deliberate, reviewed act.
   */
  const NOT_PERSONAL_DATA: Record<string, string> = {
    'Document.documentHash': 'file-integrity digest of an uploaded document, not personal data',
  };

  /** Every `…Encrypted` / `…Hash` field in the schema, as `Model.field`. */
  const declaredSensitiveColumns = (): string[] => {
    const found: string[] = [];
    let model: string | null = null;

    for (const raw of readFileSync(SCHEMA, 'utf8').split('\n')) {
      const line = raw.trim();
      if (line.startsWith('//')) continue;

      const modelStart = line.match(/^model\s+(\w+)\s*\{/);
      if (modelStart) {
        model = modelStart[1];
        continue;
      }
      if (line === '}') {
        model = null;
        continue;
      }

      const field = line.match(/^(\w+)\s+\w/);
      if (model && field && /(Encrypted|Hash)$/.test(field[1])) {
        found.push(`${model}.${field[1]}`);
      }
    }
    return found;
  };

  const omitKey = (model: string) => model.charAt(0).toLowerCase() + model.slice(1);

  it('finds sensitive columns in the schema at all (guards against a vacuous pass)', () => {
    const columns = declaredSensitiveColumns();

    expect(columns).toContain('Claimant.nricEncrypted');
    expect(columns).toContain('Claimant.nricHash');
    expect(columns).toContain('Case.bankAccountNumberEncrypted');
    expect(columns).toContain('Policy.insuredNricEncrypted');
  });

  it('omits every encrypted or hashed personal-data column by default', () => {
    const omit = SENSITIVE_FIELD_OMIT as Record<string, Record<string, boolean>>;

    const unprotected = declaredSensitiveColumns().filter(column => {
      if (NOT_PERSONAL_DATA[column]) return false;
      const [model, field] = column.split('.');
      return omit[omitKey(model)]?.[field] !== true;
    });

    expect(unprotected).toEqual([]);
  });

  it('does not omit the clear display tails that screens rely on', () => {
    const omitted = Object.values(SENSITIVE_FIELD_OMIT).flatMap(fields => Object.keys(fields));

    expect(omitted.filter(field => /Last4$/.test(field))).toEqual([]);
  });
});
