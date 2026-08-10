import { conflictRefusalReason, declarationMatchesClaim, screenConflicts } from './conflict-screening';

/**
 * COMPLIANCE TESTS — PD 10.3 / 12.1(d) conflict screening.
 *
 * The screen blocks assignment through a conflict the firm has on record, in
 * every mode — the licence flip governs gaps the firm might not know about,
 * not choices it is making with its eyes open.
 */
describe('Conflict screening (PD 10.3 / 12.1(d))', () => {
  const declaration = (over: Partial<Parameters<typeof declarationMatchesClaim>[0]> = {}) => ({
    id: 'd1',
    partyType: 'INSURER',
    partyName: 'Allianz Insurance Malaysia',
    partyTenantId: 'tenant-allianz',
    relationship: 'SPOUSE',
    resolvedAt: null,
    ...over,
  });

  const claim = (over: Partial<Parameters<typeof declarationMatchesClaim>[1]> = {}) => ({
    insurerTenantId: 'tenant-allianz',
    workshopName: null,
    ...over,
  });

  describe('matching', () => {
    it('matches a declared insurer to the claim by tenant id', () => {
      expect(declarationMatchesClaim(declaration(), claim())).toBe(true);
    });

    it('does not match a different insurer', () => {
      expect(
        declarationMatchesClaim(declaration(), claim({ insurerTenantId: 'tenant-msig' }))
      ).toBe(false);
    });

    it('matches a workshop by name in either containment direction', () => {
      const workshopDeclaration = declaration({
        partyType: 'WORKSHOP',
        partyName: 'Ah Seng Motor',
        partyTenantId: null,
      });

      expect(
        declarationMatchesClaim(workshopDeclaration, claim({ workshopName: 'Ah Seng Motor Workshop Sdn Bhd' }))
      ).toBe(true);
      expect(
        declarationMatchesClaim(workshopDeclaration, claim({ workshopName: 'ah seng' }))
      ).toBe(true);
      expect(
        declarationMatchesClaim(workshopDeclaration, claim({ workshopName: 'Best Repairs KL' }))
      ).toBe(false);
    });

    it('ignores a resolved declaration — resolution is what it is for', () => {
      expect(
        declarationMatchesClaim(declaration({ resolvedAt: new Date() }), claim())
      ).toBe(false);
    });

    it('does not fabricate a match from empty names', () => {
      const empty = declaration({ partyType: 'WORKSHOP', partyName: '   ', partyTenantId: null });
      expect(declarationMatchesClaim(empty, claim({ workshopName: 'Any Workshop' }))).toBe(false);
    });
  });

  describe('the screen', () => {
    it('is clear when nothing matches, and says how many were screened', () => {
      const result = screenConflicts(
        [declaration({ partyTenantId: 'tenant-other' })],
        claim()
      );

      // screened=1 is the point: "clear after screening one declaration" is a
      // different record from "nothing was ever declared".
      expect(result.clear).toBe(true);
      expect(result.screened).toBe(1);
    });

    it('blocks on a live matching declaration', () => {
      const result = screenConflicts([declaration()], claim());

      expect(result.clear).toBe(false);
      expect(result.matches).toHaveLength(1);
    });

    it('screens only live declarations', () => {
      const result = screenConflicts(
        [declaration({ resolvedAt: new Date() }), declaration({ id: 'd2', partyTenantId: 'x' })],
        claim()
      );

      expect(result.screened).toBe(1);
      expect(result.clear).toBe(true);
    });
  });

  describe('the refusal', () => {
    it('names the relationship and party, and cites 12.1(d)', () => {
      const reason = conflictRefusalReason([declaration()]);

      expect(reason).toContain('SPOUSE');
      expect(reason).toContain('Allianz Insurance Malaysia');
      expect(reason).toMatch(/12\.1\(d\)/);
      // The remedy is stated: resolve or reassign — not "delete the declaration".
      expect(reason).toMatch(/resolve the declaration or assign someone else/);
    });
  });
});
