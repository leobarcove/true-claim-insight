import { useState } from 'react';

export interface ExtractedDocument {
  document: string;
  url: string;
  data: any;
  metadata: {
    extraction_timestamp: string;
    confidence_score: number;
    [key: string]: any;
  };
}

export function useAiExtraction() {
  const [isExtracting, setIsExtracting] = useState(false);

  const extractData = async (
    fileMap: Record<string, File | null>,
    sessionId: string = ''
  ): Promise<any> => {
    setIsExtracting(true);

    try {
      const formData = new FormData();
      Object.entries(fileMap).forEach(([key, file]) => {
        if (file) formData.append(key, file);
      });
      formData.append('id', sessionId);

      const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000/api/v1';
      const res = await fetch(`${baseUrl}/ocr/extract`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Extraction failed');

      const responseData = await res.json();
      const actualData = responseData.data || responseData;
      return actualData.extraction || {};
    } catch (e) {
      console.error('Extraction Error:', e);
      return {};
    } finally {
      setIsExtracting(false);
    }
  };

  return { extractData, isExtracting };
}
