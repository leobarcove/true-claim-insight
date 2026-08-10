import { Injectable, Logger } from '@nestjs/common';
import archiver from 'archiver';
import { StorageService } from '../common/services/storage.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { ReportsService } from '../reports/reports.service';
import { missingFilesManifest, planEntries } from './archive-entries';
import { ClaimExportService } from './claim-export.service';
import type { ClaimFileBundle } from './claim-bundle';

interface ArchiveResult {
  filename: string;
  /** The zip as a buffer — claim files are small enough that streaming would buy
   * complexity, not headroom, at current volumes. */
  archive: Buffer;
  bundleSha256: string;
  missingFiles: number;
}

/**
 * Packages the s.143 claim file as an archive an examiner can walk away with.
 *
 * Layout: `claim-file.json` (the hash-sealed bundle), `documents/` and
 * `documents-soft-deleted/` holding the actual binaries, `reports/` holding the
 * rendered PDFs. A binary that cannot be fetched is declared in
 * MISSING_FILES.txt *and* on the export audit row — the archive may be thinner
 * than intended, but never silently so.
 */
@Injectable()
export class ClaimArchiveService {
  private readonly logger = new Logger(ClaimArchiveService.name);

  constructor(
    private readonly exporter: ClaimExportService,
    private readonly storage: StorageService,
    private readonly reports: ReportsService
  ) {}

  async exportArchive(claimId: string, tenantContext: TenantContext): Promise<ArchiveResult> {
    const bundle = await this.exporter.assembleBundle(claimId, tenantContext);

    const documents = bundle.sections.documents as {
      id: string;
      filename: string;
      storageUrl: string;
      deletedAt: Date | null;
    }[];
    const reports = bundle.sections.reports as { id: string; type: string; version: number }[];

    const entries = planEntries(documents, reports, bundle.manifest.claimNumber);
    const failures: { archivePath: string; reason: string }[] = [];

    const zip = archiver('zip', { zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    zip.on('data', chunk => chunks.push(chunk));
    const finished = new Promise<void>((resolve, reject) => {
      zip.on('end', resolve);
      zip.on('error', reject);
    });

    zip.append(JSON.stringify(bundle, null, 2), { name: 'claim-file.json' });

    for (const entry of entries) {
      try {
        const content =
          entry.source.kind === 'document'
            ? await this.storage.readFile(entry.source.storageUrl)
            : (await this.reports.render(entry.source.id)).pdf;
        zip.append(content, { name: entry.archivePath });
      } catch (error) {
        // Declared, never silent: the examiner sees the gap inside the archive
        // itself, and the audit row records it below.
        failures.push({
          archivePath: entry.archivePath,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const manifest = missingFilesManifest(failures);
    if (manifest) zip.append(manifest, { name: 'MISSING_FILES.txt' });

    await zip.finalize();
    await finished;

    const bundleSha256 = await this.exporter.recordExport(bundle, tenantContext, 'archive', {
      entriesPlanned: entries.length,
      entriesMissing: failures.length,
      ...(failures.length ? { missingFiles: failures.map(failure => failure.archivePath) } : {}),
    });

    if (failures.length) {
      this.logger.warn(
        `Claim archive for ${bundle.manifest.claimNumber}: ${failures.length} of ` +
          `${entries.length} binaries could not be included — declared in MISSING_FILES.txt`
      );
    }

    return {
      filename: `${bundle.manifest.claimNumber}-claim-file.zip`,
      archive: Buffer.concat(chunks),
      bundleSha256,
      missingFiles: failures.length,
    };
  }
}
