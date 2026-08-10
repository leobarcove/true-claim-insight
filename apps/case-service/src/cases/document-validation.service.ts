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
 * NOT IMPLEMENTED. Every document is recorded as SKIPPED — no validation runs
 * and no model is called, so `CaseDocument.validationStatus` must not be read
 * as evidence that a document was checked. Scheduled for Phase 4 of
 * docs/MASTER_PLAN.md, and it must run on in-country infrastructure before it
 * sees claimant documents (PDPA / data sovereignty).
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
