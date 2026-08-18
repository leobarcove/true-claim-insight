import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';

/**
 * SECURITY TEST — a refusal must not confirm a record exists.
 *
 * A record belonging to another tenant answers **404**, identically to one that
 * was never created. A 403 would confirm the id names something real: walk ids,
 * keep the refusals, and you have a map of another firm's book without reading
 * a single claim. The audit trail still records the attempt (`shouldAudit`), so
 * the evidence is kept where it belongs — server-side.
 *
 * Why a source scan rather than only unit tests. On 18 Aug 2026 an audit found
 * five call sites carrying the comment *"Existence check, not an access check:
 * confirming a claim exists in another tenant is itself a disclosure"* directly
 * above a line that threw `ForbiddenException`. The rule was known, written
 * down, and contradicted one line later — in four services at once. A comment
 * cannot enforce anything and a per-site unit test would not have been written
 * for a site nobody suspected. This scans instead, and every remaining throw
 * must be declared below with a reason it is not an existence oracle.
 *
 * The list is a **ratchet in spirit**: adding an entry is a deliberate decision
 * that the refusal reveals nothing an attacker could not already determine.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const SERVICES = ['case-service', 'video-service', 'risk-engine', 'api-gateway'];

/**
 * Refusals that name no record, keyed by repo-relative path → count.
 *
 * Each is one of three shapes, none of which is an oracle:
 *  - the caller has no standing at all (a guard, before any lookup);
 *  - a role or verification rule that never reads an id;
 *  - a rule about a record the caller can already see, so its existence is
 *    not what is being disclosed.
 *
 * Guards are matched by path and not enumerated: they run before a record is
 * fetched, so they cannot leak one.
 */
const GUARD_PATHS = /guards[/\\]|-webhook\.guard\.ts$/;

const DECLARED: Record<string, { count: number; reason: string }> = {
  'apps/api-gateway/src/conversations/public-conversation.controller.ts': {
    count: 1,
    reason: 'No conversation session on the request at all — nothing has been named yet',
  },
  'apps/case-service/src/adjusters/adjusters.service.ts': {
    count: 1,
    reason:
      'An adjuster asking after a colleague in their own firm. That colleague plainly exists; ' +
      'what is refused is the record, not knowledge of the person',
  },
  'apps/case-service/src/cases/cases.service.ts': {
    count: 3,
    reason:
      'Role rules that refuse before any lookup: a claimant may not use the staff listing, the ' +
      'staff correction door, or the staff case loader. No id is consulted to decide',
  },
  'apps/case-service/src/chat/claimant-conversation.service.ts': {
    count: 1,
    reason: 'Verification state of the caller — "prove your number first", not a record decision',
  },
  'apps/case-service/src/chat/conversations.service.ts': {
    count: 1,
    reason:
      'The conversation is in the caller’s own tenant and visible to them; what is refused ' +
      'is speaking over the agent who holds it',
  },
  'apps/case-service/src/chat/whatsapp/whatsapp.controller.ts': {
    count: 2,
    reason: 'Webhook signature verification — Meta is unauthenticated to us and names no record',
  },
  'apps/case-service/src/claims/claims.service.ts': {
    count: 1,
    reason:
      'Approval authority (AuthorityLimit). The caller can see the claim; what is refused is ' +
      'deciding it, and the reason must be legible or the control is unusable',
  },
  'apps/case-service/src/reports/reports.service.ts': {
    count: 3,
    reason:
      'PD 12.7 authorship rules on a report the caller can already read: only an adjusting ' +
      'employee may author or sign, and only the author may edit or submit',
  },
};

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

const countThrows = (): Record<string, number> => {
  const found: Record<string, number> = {};
  for (const service of SERVICES) {
    for (const file of sourceFiles(join(REPO_ROOT, 'apps', service, 'src'))) {
      const key = relative(REPO_ROOT, file).split(sep).join('/');
      if (GUARD_PATHS.test(key)) continue;
      const matches = readFileSync(file, 'utf8').match(/new ForbiddenException\b/g);
      if (matches) found[key] = matches.length;
    }
  }
  return found;
};

describe('a refusal must not confirm a record exists', () => {
  const found = countThrows();

  it('throws no undeclared ForbiddenException outside the guards', () => {
    const undeclared = Object.keys(found).filter(file => !DECLARED[file]);
    expect(undeclared).toEqual([]);
  });

  it('declares the right number at each site, so a new one cannot hide beside an old one', () => {
    const drifted = Object.entries(found)
      .filter(([file, count]) => DECLARED[file] && DECLARED[file].count !== count)
      .map(([file, count]) => `${file}: found ${count}, declared ${DECLARED[file].count}`);
    expect(drifted).toEqual([]);
  });

  it('has no stale declarations left behind by a fix', () => {
    const stale = Object.keys(DECLARED).filter(file => !found[file]);
    expect(stale).toEqual([]);
  });

  it('gives a reason for every declared refusal', () => {
    for (const [file, entry] of Object.entries(DECLARED)) {
      expect(entry.reason.length).toBeGreaterThan(40);
      expect(file).toMatch(/^apps\//);
    }
  });
});
