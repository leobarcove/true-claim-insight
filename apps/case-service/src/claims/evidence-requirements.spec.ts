import { readFileSync } from 'fs';
import { join } from 'path';

import { evidenceSubtypeFilter, resolveRequirements } from './evidence-requirements';

/**
 * COMPLIANCE TEST — one answer to "which documents does this claim need?"
 *
 * The defect this pins against recurring: the assessment router's
 * evidence-complete check queried by category alone while the claimant's
 * checklist scoped by travel subtype. A flight-delay claim was measured
 * against every subtype's mandatory documents (13) instead of its own (3),
 * so the fourth fast-track condition could never pass and the desk-review
 * fast track — the §2.5 COGS control — silently never fired on travel.
 */

type Row = {
  documentType: string;
  travelClaimType: string | null;
  isMandatory: boolean;
};

const row = (documentType: string, travelClaimType: string | null, isMandatory = true): Row => ({
  documentType,
  travelClaimType,
  isMandatory,
});

describe('evidenceSubtypeFilter', () => {
  it('matches the subtype rows plus the subtype-generic rows', () => {
    expect(evidenceSubtypeFilter('FLIGHT_DELAY' as never)).toEqual({
      OR: [{ travelClaimType: 'FLIGHT_DELAY' }, { travelClaimType: null }],
    });
  });

  it('collapses to generic-only when there is no subtype (non-travel lines)', () => {
    expect(evidenceSubtypeFilter(null)).toEqual({ travelClaimType: null });
    expect(evidenceSubtypeFilter(undefined)).toEqual({ travelClaimType: null });
  });
});

describe('resolveRequirements', () => {
  it('returns one row per documentType', () => {
    const resolved = resolveRequirements(
      [row('BOARDING_PASS', null), row('BOARDING_PASS', 'FLIGHT_DELAY')],
      []
    );
    expect(resolved).toHaveLength(1);
  });

  it('subtype-specific beats subtype-generic within the same scope', () => {
    const resolved = resolveRequirements(
      [row('BOARDING_PASS', null, true), row('BOARDING_PASS', 'FLIGHT_DELAY', false)],
      []
    );
    expect(resolved[0].isMandatory).toBe(false);
  });

  it('a tenant-generic row beats a global subtype-specific one', () => {
    const resolved = resolveRequirements(
      [row('POLICE_REPORT', 'LUGGAGE', true)],
      [row('POLICE_REPORT', null, false)]
    );
    expect(resolved[0].isMandatory).toBe(false);
  });

  it('a tenant row relaxing a global mandatory requirement wins — counting both would demand a document the tenant chose not to require', () => {
    const resolved = resolveRequirements(
      [row('PURCHASE_INVOICE', null, true)],
      [row('PURCHASE_INVOICE', null, false)]
    );
    const mandatory = resolved.filter(r => r.isMandatory);
    expect(mandatory).toHaveLength(0);
  });

  it('keeps unrelated documentTypes side by side', () => {
    const resolved = resolveRequirements(
      [row('BOARDING_PASS', 'FLIGHT_DELAY'), row('DELAY_CONFIRMATION', 'FLIGHT_DELAY')],
      [row('CLAIM_FORM', null)]
    );
    expect(resolved.map(r => r.documentType).sort()).toEqual([
      'BOARDING_PASS',
      'CLAIM_FORM',
      'DELAY_CONFIRMATION',
    ]);
  });
});

describe('the single-answer invariant', () => {
  // Source scan, same pattern as the retention and audit-scope suites: the
  // checklist and the fast track must resolve requirements through this
  // module. A second inline resolution is how the two answers drifted apart
  // the first time.
  const read = (relative: string) =>
    readFileSync(join(__dirname, '..', relative), 'utf8');

  it('the assessment router resolves evidence through the shared rules', () => {
    const source = read('assessment/assessment.service.ts');
    expect(source).toContain('evidenceSubtypeFilter(');
    expect(source).toContain('resolveRequirements(');
  });

  it('the claimant checklist resolves evidence through the shared rules', () => {
    const source = read('claims/claims.service.ts');
    expect(source).toContain('evidenceSubtypeFilter(');
    expect(source).toContain('resolveRequirements(');
  });
});
