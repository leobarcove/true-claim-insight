/**
 * Abstraction over the LLM backend. Same plugin pattern as
 * RainfallDataSource and SignatureProvider: bind a concrete impl to the
 * LLM_PROVIDER token in LlmModule, every consumer depends on the
 * interface. Swapping models or vendors = one line of module config.
 *
 * Current implementations:
 *  - OllamaGpuLlmProvider: self-hosted models on an office GPU desktop,
 *    reached over a private tailnet. Ollama serves generation on :11434 and
 *    Surya serves OCR on :8002 (docs/gpu-api-contract.md). This keeps
 *    documents off third-party APIs; it does NOT make the path compliant —
 *    an office desktop is not controlled in-country infrastructure, and
 *    docs/MASTER_PLAN.md §3.4 is unchanged by it.
 *  - GeminiLlmProvider: Google Gemini via @google/genai. Faster + more
 *    capable, but routes data through Google. Default for dev/demo.
 */

/**
 * One line of text located on a page.
 *
 * `bbox` is `[x0, y0, x1, y1]` in pixels and `confidence` is per line, as
 * returned by Surya (docs/gpu-api-contract.md §5).
 */
export interface OcrLine {
  text: string;
  confidence: number;
  bbox: [number, number, number, number];
}

export interface OcrPage {
  /** 1-based page number, as the OCR engine reports it. */
  page: number;
  lines: OcrLine[];
  fullText: string;
}

export interface OcrResult {
  /** Flattened text of the whole document — what extraction prompts consume. */
  text: string;

  /**
   * Per-line grounding, when the engine provides it.
   *
   * CASE_VERIFICATION_ENGINE.md §8 requires every extracted field to carry a
   * page and a bounding box. That has to come from a discriminative OCR engine
   * which cannot invent text that is not on the page — never from asking an
   * LLM for coordinates. Optional because not every backend has it: the Gemini
   * path forwards to vision with a "text only" prompt and returns no geometry.
   */
  pages?: OcrPage[];
}

export interface LlmProvider {
  /** Stable provider identifier persisted on Document.analysis.modelUsed. */
  readonly name: string;

  /**
   * Whether a call to this provider sends personal data outside Malaysia.
   *
   * This drives the TransferRecord obligation under PDPA s.129, so it is a
   * property of the provider rather than something each call site works out.
   * It replaced `provider.name === 'Gemini'` checks, which were both easy to
   * forget — the intake normaliser recorded a Google transfer unconditionally,
   * including on runs where nothing left the machine — and wrong the moment a
   * second offshore backend appears.
   *
   * A register that says the wrong thing is worse than a thin one.
   */
  readonly offshore: boolean;

  /** Default model id used when no override is passed. */
  readonly defaultModel: string;

  /**
   * Model id that serves visionJson().
   *
   * Separate from defaultModel because the Ollama path splits the jobs across
   * different models, and recording the text model against a document a vision
   * model actually read makes the provenance wrong. Backends with one
   * multimodal model report the same id twice.
   */
  readonly visionModel: string;

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
   * route this to a more capable model (e.g. gemini-pro).
   */
  reasoningJson(prompt: string, model?: string): Promise<any>;

  /**
   * Plain OCR — return the text content of a document, plus per-line
   * grounding where the backend supplies it. Some providers (Ollama path) use
   * a dedicated OCR engine (Surya); others (Gemini) forward to vision with a
   * "return text only" prompt.
   */
  ocr(fileBuffer: Buffer, filename: string): Promise<OcrResult>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
