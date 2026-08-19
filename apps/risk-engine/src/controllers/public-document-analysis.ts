/**
 * What a client is allowed to see of a document analysis.
 *
 * An ALLOWLIST, and that is the whole point. This was a denylist -- the handler
 * destructured `modelUsed` off and returned everything else -- so every column
 * was public by default and each new one joined them silently. It stripped the
 * model id, which is provenance, and returned `rawText`, which was the full OCR
 * text of the document: for a MyKad, the NRIC in plaintext, over the wire, while
 * the same number on Claimant is encrypted under a KeyProvider.
 *
 * `rawText` is gone from the schema now. The shape matters more than that one
 * column: grounding (per-line text and bounding boxes) is the next thing to land
 * here, it carries document text too, and under a denylist it would have been
 * served the day it was added without anyone deciding to.
 *
 * Add a field here only when a client needs it.
 */
export interface PublicDocumentAnalysis {
  documentId: string;
  extractedData: unknown;
  visionData: unknown;
  confidence: number | null;
  processingTime: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export function publicDocumentAnalysis(
  analysis: Record<string, any>
): PublicDocumentAnalysis {
  return {
    documentId: analysis.documentId,
    extractedData: analysis.extractedData ?? null,
    visionData: analysis.visionData ?? null,
    confidence: analysis.confidence ?? null,
    processingTime: analysis.processingTime ?? null,
    createdAt: analysis.createdAt,
    updatedAt: analysis.updatedAt,
  };
}
