import { Injectable, Logger } from '@nestjs/common';
import { DocumentType } from '@tci/shared-types';
import { EXTRACTION_PROMPTS } from './prompts';
import { getNormalizer } from './normalizers';

@Injectable()
export class ExtractionService {
  private readonly logger = new Logger(ExtractionService.name);

  getPrompt(type: DocumentType, text?: string): string {
    const specificPrompt = EXTRACTION_PROMPTS[type] || `Extract key information in JSON format.`;

    let prompt = `
    ${specificPrompt}
    
    Ensure the output is valid JSON only. Do not wrap in markdown blocks.
    `;

    if (text) {
      prompt += `
    
    DOCUMENT TEXT:
    ${text}`;
    }

    return prompt;
  }

  normalize(type: DocumentType, rawData: any): any {
    const normalizer = getNormalizer(type);
    if (!normalizer) {
      this.logger.warn(`No normalizer found for document type: ${type}`);
      return rawData;
    }

    try {
      const normalized = normalizer.normalize(rawData);

      // Validate if needed
      // this.validate(type, normalized);

      return normalized;
    } catch (error: any) {
      this.logger.error(`Normalization failed for ${type}: ${error.message}`);
      return rawData;
    }
  }
}
