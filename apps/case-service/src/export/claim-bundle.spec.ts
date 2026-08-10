import {
  BUNDLE_SECTIONS,
  SINGULAR_SECTIONS,
  bundleHash,
  missingSections,
  sectionCounts,
  type ClaimFileBundle,
} from './claim-bundle';

/**
 * COMPLIANCE TESTS — FSA s.143 claim-file production.
 *
 * The bundle is what the firm hands BNM when asked for everything on a claim.
 * The risk is not a missing endpoint but a *partial file presented as
 * complete* — so completeness is data (BUNDLE_SECTIONS) asserted here, and the
 * hash makes what was produced provable afterwards.
 */
describe('Claim file bundle (s.143)', () => {
  const fullSections = () =>
    Object.fromEntries(
      BUNDLE_SECTIONS.map(section => [section, SINGULAR_SECTIONS.includes(section) ? { id: 'x' } : []])
    ) as Record<(typeof BUNDLE_SECTIONS)[number], unknown>;

  const bundle = (): ClaimFileBundle => ({
    manifest: {
      claimId: 'c1',
      claimNumber: 'CLM-1',
      producedAt: '2026-07-31T00:00:00.000Z',
      producedByUserId: 'u1',
      counts: sectionCounts(fullSections()),
      note: 'test',
    },
    sections: fullSections(),
  });

  describe('completeness', () => {
    it('covers every record type the compliance matrix names for a claim', () => {
      // Documents (incl. soft-deleted), reports, SLA history, consents, the
      // transfer register, the audit trail, the appointment, sessions, notes:
      // each is cited by a matrix row. Removing one here is a compliance
      // decision, not a refactor.
      expect([...BUNDLE_SECTIONS].sort()).toEqual([
        'assignment',
        'auditTrail',
        'claim',
        'claimant',
        'consents',
        'documents',
        'notes',
        'reports',
        'sessions',
        'slaClocks',
        'transferRecords',
      ]);
    });

    it('reports a dropped section rather than passing a partial file', () => {
      const sections = fullSections();
      delete (sections as Record<string, unknown>).transferRecords;

      expect(missingSections(sections)).toEqual(['transferRecords']);
    });

    it('reports nothing missing for a complete assembly', () => {
      expect(missingSections(fullSections())).toEqual([]);
    });
  });

  describe('the manifest counts', () => {
    it('distinguishes an empty list from an absent singular record', () => {
      const sections = fullSections();
      (sections as Record<string, unknown>).documents = [];
      (sections as Record<string, unknown>).assignment = null;

      const counts = sectionCounts(sections);
      // 0 says "we looked, there are none"; null says "this record does not
      // exist" — an examiner reads those very differently.
      expect(counts.documents).toBe(0);
      expect(counts.assignment).toBeNull();
      expect(counts.claim).toBe(1);
    });
  });

  describe('the hash seal', () => {
    it('is stable across key order, which is an implementation detail', () => {
      const a = bundle();
      const b = bundle();
      (b.sections as Record<string, unknown>).claim = { id: 'x' }; // same value, fresh object

      expect(bundleHash(a)).toBe(bundleHash(b));
    });

    it('changes when any content changes — that is the point of sealing it', () => {
      const a = bundle();
      const b = bundle();
      (b.sections as Record<string, unknown>).documents = [{ id: 'tampered' }];

      expect(bundleHash(a)).not.toBe(bundleHash(b));
    });

    it('is a plain sha256 hex string an examiner can recompute', () => {
      expect(bundleHash(bundle())).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
