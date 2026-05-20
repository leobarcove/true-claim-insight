/**
 * AI extraction hook — local copy of the motor wizard's pattern. Posts a
 * multipart bundle to /ocr/extract via the api-gateway, which forwards to
 * the external extraction webhook (configured in apps/api-gateway/src/ocr).
 *
 * Field names sent to the backend must match what the webhook expects:
 *   - mykad: MyKad / NRIC front-side document
 *   - policy_document: insurance policy schedule
 *   - police_report: official report (less relevant for flood)
 *   - damaged_evidence: scene/damage photo
 * Unsupported fieldnames are accepted but won't return structured data.
 */
import { useState } from 'react';
import { apiClient } from '@/lib/api-client';

export interface ExtractedDocument {
  document?: any;
  url?: string;
  data?: any;
  metadata?: {
    extraction_timestamp?: string;
    confidence_score?: number;
    [key: string]: any;
  };
}

export interface ExtractionResult {
  mykad?: ExtractedDocument;
  policy_document?: ExtractedDocument;
  police_report?: ExtractedDocument;
  damaged_evidence?: ExtractedDocument;
  [key: string]: ExtractedDocument | undefined;
}

export function useAiExtraction() {
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extractData = async (
    fileMap: Record<string, File | null>,
    sessionId: string = `flood-${Date.now()}`
  ): Promise<ExtractionResult> => {
    setIsExtracting(true);
    setError(null);

    try {
      const formData = new FormData();
      Object.entries(fileMap).forEach(([key, file]) => {
        if (file) formData.append(key, file);
      });
      formData.append('id', sessionId);

      const { data } = await apiClient.post('/ocr/extract', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // The webhook response is wrapped twice: ApiResponse<{ extraction: {...} }>.
      // Defend against both nested shapes.
      const body = (data as any).data ?? data;
      const extraction = body?.extraction ?? body ?? {};
      return extraction as ExtractionResult;
    } catch (e: any) {
      const msg = e?.response?.data?.message ?? e?.message ?? 'Extraction failed';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
      return {};
    } finally {
      setIsExtracting(false);
    }
  };

  return { extractData, isExtracting, error };
}
