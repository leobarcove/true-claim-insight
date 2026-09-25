import { publicDocumentAnalysis } from './public-document-analysis';

/**
 * WHAT LEAVES THE SERVER IS AN ALLOWLIST, and this test is why.
 *
 * The handler used to destructure `modelUsed` off the row and return the rest,
 * so every column was public by default. It stripped the model id -- provenance,
 * harmless -- and returned `rawText`, the full OCR text of the document. For a
 * MyKad that is the NRIC in plaintext, served on request, while the same number
 * on Claimant is encrypted under a KeyProvider and omitted from query results.
 *
 * Grounding lands here next and carries document text too. Under a denylist it
 * would have been published the day it was added.
 */
const row = {
  id: 'analysis-1',
  documentId: 'doc-1',
  extractedData: { nric: '900101-14-5501' },
  visionData: { raw: 'x' },
  modelUsed: 'OllamaGpu:qwen3-vl:8b',
  confidence: 0.9,
  processingTime: 1200,
  createdAt: new Date('2026-08-19T00:00:00Z'),
  updatedAt: new Date('2026-08-19T00:00:00Z'),
  tenantId: 'tenant-1',
  userId: 'user-1',
};

describe('what a client may see of a document analysis', () => {
  it('returns only the named fields', () => {
    expect(Object.keys(publicDocumentAnalysis(row)).sort()).toEqual([
      'confidence',
      'createdAt',
      'documentId',
      'extractedData',
      'processingTime',
      'updatedAt',
      'visionData',
    ]);
  });

  it('does not publish a column merely because it exists on the row', () => {
    // The denylist failure, stated directly: a future column must not become
    // public by being added to the schema.
    const withGrounding = {
      ...row,
      grounding: [{ text: '900101-14-5501', bbox: [0, 0, 1, 1] }],
      rawText: 'MYKAD 900101-14-5501',
    };
    const out = publicDocumentAnalysis(withGrounding) as unknown as Record<string, unknown>;
    expect(out).not.toHaveProperty('grounding');
    expect(out).not.toHaveProperty('rawText');
    expect(JSON.stringify(out)).not.toContain('MYKAD');
  });

  it('does not leak tenant or user ownership', () => {
    const out = publicDocumentAnalysis(row) as unknown as Record<string, unknown>;
    expect(out).not.toHaveProperty('tenantId');
    expect(out).not.toHaveProperty('userId');
  });

  it('keeps what the portal actually reads', () => {
    // adjuster-portal reads extractedData and nothing else off this response.
    expect(publicDocumentAnalysis(row).extractedData).toEqual({ nric: '900101-14-5501' });
  });

  it('survives a sparse row without inventing values', () => {
    const out = publicDocumentAnalysis({ documentId: 'doc-2', createdAt: row.createdAt, updatedAt: row.updatedAt });
    expect(out.confidence).toBeNull();
    expect(out.extractedData).toBeNull();
  });
});
