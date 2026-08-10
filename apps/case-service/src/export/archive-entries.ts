/**
 * Planning the archive's contents — pure, so it can be tested exhaustively.
 *
 * The archive is what an examiner walks away with, so its layout is decided
 * here rather than emerging from a loop: stable folder names, collision-proof
 * file names, and a loud MISSING_FILES.txt whenever a binary could not be
 * fetched. A silently thinner archive would be a partial file presented as
 * complete — the exact failure the JSON bundle already refuses.
 */

export interface DocumentEntryInput {
  id: string;
  filename: string;
  storageUrl: string;
  deletedAt?: Date | string | null;
}

export interface ReportEntryInput {
  id: string;
  type: string;
  version: number;
}

export interface PlannedEntry {
  /** Path inside the archive. */
  archivePath: string;
  source: { kind: 'document'; id: string; storageUrl: string } | { kind: 'report'; id: string };
}

/** Keep names filesystem-safe without losing the original beyond recognition. */
export function safeName(filename: string): string {
  const cleaned = filename.replace(/[^\w.\- ]+/g, '_').trim();
  // A name with no letter or digit left ("///" → "_") carries no information;
  // better an honest placeholder than punctuation soup. Note \w would not do —
  // it matches underscore, which is exactly the character the cleaning inserts.
  if (!/[A-Za-z0-9]/.test(cleaned)) return 'unnamed';
  return cleaned.length > 120 ? cleaned.slice(0, 120) : cleaned;
}

/**
 * Archive layout for a claim file.
 *
 * Document names are prefixed with a short id so two uploads of `receipt.pdf`
 * cannot overwrite each other inside the archive. Soft-deleted documents are
 * included under their own folder — they are part of the record (PD 12.8), and
 * separating them keeps the examiner's view honest about what the firm had
 * "deleted".
 */
export function planEntries(
  documents: DocumentEntryInput[],
  reports: ReportEntryInput[],
  claimNumber: string
): PlannedEntry[] {
  const entries: PlannedEntry[] = documents.map(document => ({
    archivePath: `${document.deletedAt ? 'documents-soft-deleted' : 'documents'}/${document.id.slice(0, 8)}_${safeName(document.filename)}`,
    source: { kind: 'document', id: document.id, storageUrl: document.storageUrl },
  }));

  for (const report of reports) {
    entries.push({
      archivePath: `reports/${claimNumber}-${report.type.toLowerCase()}-v${report.version}.pdf`,
      source: { kind: 'report', id: report.id },
    });
  }

  return entries;
}

/** The declaration written into the archive when any binary could not be read. */
export function missingFilesManifest(
  failures: { archivePath: string; reason: string }[]
): string | null {
  if (!failures.length) return null;

  return [
    'MISSING FILES',
    '',
    'The following entries could not be included. Their metadata remains in',
    'claim-file.json; the gap is declared here rather than left silent, and is',
    'also recorded on the export audit row.',
    '',
    ...failures.map(failure => `- ${failure.archivePath}: ${failure.reason}`),
    '',
  ].join('\n');
}
