/**
 * Abstraction over the LLM backend. Same plugin pattern as
 * RainfallDataSource and SignatureProvider: bind a concrete impl to the
 * LLM_PROVIDER token in LlmModule, every consumer depends on the
 * interface. Swapping models or vendors = one line of module config.
 *
 * Current implementations:
 *  - OllamaGpuLlmProvider: self-hosted Qwen / DeepSeek via a Cloudflare-
 *    tunnelled GPU box. Keeps data in-country (PDPA / Malaysian data
 *    sovereignty rule).
 *  - GeminiLlmProvider: Google Gemini via @google/genai. Faster + more
 *    capable, but routes data through Google. Default for dev/demo.
 */

export interface LlmProvider {
  /** Stable provider identifier persisted on Document.analysis.modelUsed. */
  readonly name: string;

  /** Default model id used when no override is passed. */
  readonly defaultModel: string;

  /**
   * Generate structured JSON from a text-only prompt. The returned shape
   * is whatever the prompt asked for — providers must not add wrapper
   * envelopes (downstream normalizers expect raw structured fields).
   */
  generateJson(prompt: string, model?: string): Promise<any>;

  /**
   * Generate structured JSON from a document image / PDF. Used for
   * OCR + extraction in one shot.
   */
  visionJson(
    prompt: string,
    fileBuffer: Buffer,
    filename: string,
    model?: string
  ): Promise<any>;

  /**
   * Reasoning / chain-of-thought style generation. Implementations may
   * route this to a more capable model (e.g. deepseek-r1, gemini-pro).
   */
  reasoningJson(prompt: string, model?: string): Promise<any>;

  /**
   * Plain OCR — return the raw text content of a document. Some
   * providers (Ollama path) use a dedicated OCR engine (Surya); others
   * (Gemini) forward to vision with a "return text only" prompt.
   */
  ocr(fileBuffer: Buffer, filename: string): Promise<{ text: string }>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
