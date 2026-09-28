import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import * as ts from 'typescript';

/**
 * SECURITY TEST — every method that takes a claim id checks it.
 *
 * Who may reach a claim is one rule (`common/access/claim-access.ts`). On
 * 24 Sep 2026 a re-check found services that took a claim id and either
 * compared only the owner (quantum, assessment, SLA, appointments, site
 * visits — so the appointing insurer got a 404 on files it may read) or
 * checked nothing at all (three billing writes, appointment linking). An
 * earlier sweep had missed them because it asked whether a *file* contained a
 * check, not whether each *method* did.
 *
 * This asks per method: a method with a `claimId` parameter and a
 * `TenantContext` parameter must reach `assertClaimAccess` or
 * `validateClaimAccess` — directly, or through methods it calls (resolved by
 * name across the service, to a fixpoint). Resolution by name can over-accept
 * when two methods share one; it cannot under-accept, so a failure here is
 * always real.
 */

const SRC = join(__dirname, '..', '..');
const CHECKS = /\b(assertClaimAccess|validateClaimAccess)\(/;

/**
 * Methods that take a claim id without checking it, each with the reason the
 * check is elsewhere. Adding one is a decision that needs a reason.
 */
const EXEMPT: Record<string, string> = {};

interface Method {
  key: string;
  name: string;
  body: string;
  takesClaim: boolean;
}

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts') ? [full] : [];
  });

function collect(): Method[] {
  const methods: Method[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true
    );
    const path = relative(SRC, file).split(sep).join('/');
    source.forEachChild(node => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.body) continue;
        const params = member.parameters.map(p => ({
          name: p.name.getText(),
          type: p.type?.getText() ?? '',
        }));
        methods.push({
          key: `${path} ${node.name.getText()}.${member.name.getText()}`,
          name: member.name.getText(),
          body: member.body.getText(),
          takesClaim:
            params.some(p => p.name === 'claimId') &&
            params.some(p => p.type.includes('TenantContext')),
        });
      }
    });
  }
  return methods;
}

describe('every method that takes a claim id checks access to it', () => {
  const methods = collect();

  // Fixpoint: a method checks if it calls a check, or calls a method that does.
  const checking = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const method of methods) {
      if (checking.has(method.name)) continue;
      const calls = [...method.body.matchAll(/\bthis\.(?:\w+\.)?(\w+)\(/g)].map(m => m[1]);
      if (CHECKS.test(method.body) || calls.some(name => checking.has(name))) {
        checking.add(method.name);
        grew = true;
      }
    }
  }

  it('finds the methods it is meant to check (the scan itself works)', () => {
    expect(methods.filter(method => method.takesClaim).length).toBeGreaterThan(30);
  });

  it('has no unchecked claim access', () => {
    const unchecked = methods
      .filter(method => method.takesClaim)
      .filter(method => !checking.has(method.name))
      .filter(method => !EXEMPT[method.key])
      .map(method => method.key);
    expect(unchecked).toEqual([]);
  });

  it('keeps one rule: no service compares a claim owner by hand', () => {
    // The owner-only comparison is what left the appointing insurer out.
    const handRolled = sourceFiles(SRC)
      .filter(file =>
        /claim\.tenantId !== tenantContext\.tenantId/.test(readFileSync(file, 'utf8'))
      )
      .map(file => relative(SRC, file));
    expect(handRolled).toEqual([]);
  });
});
