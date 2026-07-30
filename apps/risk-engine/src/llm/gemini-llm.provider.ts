import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { LlmProvider } from './llm-provider.interface';

/**
 * LlmProvider impl backed by Google Gemini via @google/genai.
 *
 * Trade-off vs OllamaGpuLlmProvider:
 *  + Faster, more capable, lower operational burden (no GPU box to run).
 *  + Structured JSON output is reliable (responseMimeType=application/json).
 *  - Routes document data (incl. MyKad images and NRIC values) through
 *    Google's API, outside Malaysia.
 *
 * ⚠️ THIS IS CURRENTLY THE LIVE DEFAULT whenever GEMINI_API_KEY is set — the
 * caveat below was written as a pre-condition but the default was flipped
 * anyway. Until Phase 2 of docs/MASTER_PLAN.md makes an in-country provider
 * the default for documents containing personal data, do not process real
 * claimant documents through this provider; a cross-border transfer basis
 * under PDPA has not been established.
 *
 * One model handles all four LlmProvider methods (text, vision, OCR,
 * reasoning) — Gemini Flash is multimodal. Override per call site via
 * the `model` argument if a different model is required.
 */
@Injectable()
export class GeminiLlmProvider implements LlmProvider {
  private readonly logger = new Logger(GeminiLlmProvider.name);
  private readonly client: GoogleGenAI;
  readonly name = 'Gemini';
  readonly defaultModel: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      // Throwing here would block bootstrap; warn instead and fail
      // lazily on the first call so the rest of the app can still start.
      this.logger.warn(
        'GEMINI_API_KEY not configured — Gemini calls will fail until it is set.'
      );
    }
    this.client = new GoogleGenAI({ apiKey: apiKey ?? '' });
    // gemini-2.5-flash is currently Google's recommended fast/cheap
    // multimodal model — handles JSON extraction, vision, and OCR via
    // one model. Override per-deployment with GEMINI_MODEL env var
    // (e.g. gemini-2.5-pro for higher quality on reasoning workloads).
    this.defaultModel = this.configService.get<string>(
      'GEMINI_MODEL',
      'gemini-2.5-flash'
    );
  }

  async generateJson(prompt: string, model = this.defaultModel): Promise<any> {
    const response = await this.client.models.generateContent({
      model,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    return this.parseJsonResponse(response.text);
  }

  async visionJson(
    prompt: string,
    fileBuffer: Buffer,
    filename: string,
    model = this.defaultModel
  ): Promise<any> {
    const response = await this.client.models.generateContent({
      model,
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: this.guessMimeType(filename),
                data: fileBuffer.toString('base64'),
              },
            },
          ],
        },
      ],
      config: { responseMimeType: 'application/json' },
    });
    return this.parseJsonResponse(response.text);
  }

  async reasoningJson(prompt: string, model = this.defaultModel): Promise<any> {
    // Gemini Flash handles reasoning fine for this scope. If a stronger
    // reasoning model is needed, override per call via the model arg
    // (e.g. 'gemini-2.5-pro') without touching the interface.
    const response = await this.client.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        temperature: 0.3,
      },
    });
    return this.parseJsonResponse(response.text);
  }

  /**
   * "Pure OCR" path — Ollama uses Surya; Gemini just asks the vision
   * model to return text. Returns the same {text} shape so consumers
   * don't care which provider answered.
   */
  async ocr(fileBuffer: Buffer, filename: string): Promise<{ text: string }> {
    const response = await this.client.models.generateContent({
      model: this.defaultModel,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text:
                'Extract every visible character from this document as plain text. ' +
                'Preserve line breaks. Do not summarise or comment.',
            },
            {
              inlineData: {
                mimeType: this.guessMimeType(filename),
                data: fileBuffer.toString('base64'),
              },
            },
          ],
        },
      ],
    });
    return { text: response.text ?? '' };
  }

  private parseJsonResponse(raw: string | undefined): any {
    if (!raw) return {};
    // Gemini returns a JSON-formatted string under responseMimeType=json.
    // Be defensive — strip code fences if the model leaked any.
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch (e: any) {
      this.logger.error(
        `Gemini returned non-JSON content: ${cleaned.slice(0, 200)}`
      );
      throw new Error(`Failed to parse Gemini response as JSON: ${e.message}`);
    }
  }

  private guessMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      heic: 'image/heic',
      heif: 'image/heif',
    };
    return map[ext] ?? 'application/octet-stream';
  }
}
