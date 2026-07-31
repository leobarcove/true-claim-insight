import { missingFilesManifest, planEntries, safeName } from './archive-entries';

/**
 * COMPLIANCE TESTS — the s.143 archive's layout and its honesty about gaps.
 *
 * The archive is what an examiner walks away with. The failure that matters is
 * not a missing feature but a silently thinner archive — so collisions cannot
 * overwrite entries, deleted documents are visibly separated, and a fetch
 * failure must surface inside the archive itself.
 */
describe('Claim archive entries (s.143)', () => {
  const doc = (over: Partial<Parameters<typeof planEntries>[0][0]> = {}) => ({
    id: 'aaaabbbb-0000-1111-2222-333344445555',
    filename: 'receipt.pdf',
    storageUrl: 'cases/x/receipt.pdf',
    deletedAt: null,
    ...over,
  });

  describe('layout', () => {
    it('prefixes document names with an id so duplicates cannot overwrite each other', () => {
      const entries = planEntries(
        [doc({ id: '11111111-a' }), doc({ id: '22222222-b' })],
        [],
        'CLM-1'
      );

      // Two uploads of "receipt.pdf" must both survive into the archive.
      const paths = entries.map(entry => entry.archivePath);
      expect(new Set(paths).size).toBe(2);
      expect(paths[0]).toContain('11111111');
      expect(paths[1]).toContain('22222222');
    });

    it('separates soft-deleted documents into their own folder', () => {
      // They are part of the record (PD 12.8), and the separation keeps the
      // examiner's view honest about what the firm had "deleted".
      const entries = planEntries([doc(), doc({ id: 'deleted-1', deletedAt: new Date() })], [], 'CLM-1');

      expect(entries[0].archivePath).toMatch(/^documents\//);
      expect(entries[1].archivePath).toMatch(/^documents-soft-deleted\//);
    });

    it('names report PDFs by claim, type and version', () => {
      const entries = planEntries([], [{ id: 'r1', type: 'FINAL', version: 2 }], 'CLM-2026-000011');

      expect(entries[0].archivePath).toBe('reports/CLM-2026-000011-final-v2.pdf');
    });
  });

  describe('filename safety', () => {
    it('neutralises path traversal and separators', () => {
      expect(safeName('../../etc/passwd')).not.toContain('/');
      expect(safeName('..\\..\\boot.ini')).not.toContain('\\');
    });

    it('keeps ordinary names recognisable', () => {
      expect(safeName('police report (final).pdf')).toBe('police report _final_.pdf');
    });

    it('caps absurd lengths and never returns an empty name', () => {
      expect(safeName('a'.repeat(500)).length).toBeLessThanOrEqual(120);
      expect(safeName('///')).toBe('unnamed');
    });
  });

  describe('declared gaps', () => {
    it('produces no manifest when nothing is missing', () => {
      expect(missingFilesManifest([])).toBeNull();
    });

    it('names every missing entry and says where its metadata survives', () => {
      const manifest = missingFilesManifest([
        { archivePath: 'documents/x_receipt.pdf', reason: 'storage read failed (404)' },
      ]);

      expect(manifest).toContain('documents/x_receipt.pdf');
      expect(manifest).toContain('storage read failed (404)');
      // The declaration must point back at the sealed bundle, where the
      // metadata of the missing file still exists.
      expect(manifest).toContain('claim-file.json');
    });
  });
});
