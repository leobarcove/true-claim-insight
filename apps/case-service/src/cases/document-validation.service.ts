import { Injectable, Logger } from '@nestjs/common';
import { CaseDocument, DocumentValidationStatus } from '@prisma/client';

export interface DocumentValidationResult {
  status: DocumentValidationStatus;
  note?: string;
}

/**
 * AI document validation hook — the integration point for the locally-hosted
 * LLM that will check uploaded evidence (does the document name match the
 * claimant, is it the requested document type, is it complete/legible).
 *
 * Kept local (self-hosted) by design for PDPA/data-sovereignty reasons.
 * Slice 1 returns SKIPPED so the pipeline is wired without any model call.
 */
@Injectable()
export class DocumentValidationService {
  private readonly logger = new Logger(DocumentValidationService.name);

  async validate(document: Pick<CaseDocument, 'id' | 'fileName' | 'documentType'>): Promise<DocumentValidationResult> {
    this.logger.debug(
      `Document validation skipped for ${document.id} (${document.documentType}) — local LLM not yet integrated`
    );
    return { status: DocumentValidationStatus.SKIPPED };
  }
}
