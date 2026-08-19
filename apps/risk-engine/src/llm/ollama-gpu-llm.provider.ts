import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider, OcrLine, OcrPage, OcrResult } from './llm-provider.interface';

/**
 * LlmProvider impl backed by the self-hosted models on the office GPU desktop.
 *
 * TWO SERVICES, TWO URLS. This class used to call `/v3/ocr`, `/v3/llm/generate`
 * and `/v3/llm/vision` on a single host. That API was never Ollama's — it
 * belonged to the `finura` project's backend on the same desktop, which is
 * halted, and it is why this class once addressed a Cloudflare tunnel. What
 * actually runs there, recorded in docs/gpu-api-contract.md on 19 August 2026:
 *
 *   Ollama   :11434  POST /api/chat            generation, text and vision
 *   Surya    :8002   POST /ocr                 OCR with per-line geometry
 *
 * They are separate services on separate ports, so one base URL cannot front
 * both. Everything below is written against that recorded contract rather than
 * inferred: every previous guess about this host — an expired tunnel, the /v3
 * API, three model ids, a model tag that resolved to an unrelated fine-tune —
 * turned out to be wrong.
 *
 * DATA SOVEREIGNTY STATUS: not achieved, and this class does not change it.
 * The intended benefit is keeping claimant documents off third-party APIs, but
 * the endpoint is an office desktop on a private tailnet — a machine somebody
 * may reboot, not controlled in-country infrastructure. Do not describe this
 * path as PDPA-compliant; docs/MASTER_PLAN.md §3.4 is unchanged by it.
 */
@Injectable()
export class OllamaGpuLlmProvider implements LlmProvider {
  private readonly logger = new Logger(OllamaGpuLlmProvider.name);

  /** Ollama, from GPU_SERVICE_URL. */
  private readonly configuredUrl?: string;

  /** Surya, from SURYA_SERVICE_URL — a different service on a different port. */
  private readonly suryaUrl?: string;

  readonly name = 'OllamaGpu';

  /**
   * Nothing leaves the machine this points at, so no transfer is recorded.
   *
   * That is a statement about geography, not about compliance. The endpoint is
   * an office desktop on a private tailnet — not controlled in-country
   * infrastructure — so this earns no sovereignty claim on its own. See the
   * class comment and MASTER_PLAN §3.4.
   */
  readonly offshore = false;

  /**
   * Context window for every call.
   *
   * 8192 is the value the host was probed with throughout
   * (docs/gpu-api-contract.md), so it is a verified-working number rather than
   * a hopeful one. Ollama silently truncates a prompt that exceeds the context
   * it was given, which loses the tail of a long document with no error.
   */
  private static readonly NUM_CTX = 8192;

  /**
   * Model ids, from configuration rather than baked in.
   *
   * These were literals -- 'qwen2.5:7b', 'qwen2.5vl:7b', 'deepseek-r1:14b' --
   * and by the time the host was surveyed not one of them was on it. That is
   * the same bug as the Cloudflare quick-tunnel this class used to default to:
   * a hardcoded value that was true when written and silently stopped being
   * true, with nothing in the code able to notice.
   *
   * Defaults are the tags pulled onto the host, confirmed present by digest on
   * 19 August 2026 (docs/gpu-api-contract.md §2). Unlike the tunnel, a wrong
   * model id fails legibly -- Ollama answers "model not found" -- so a default
   * is safe here in a way it was not there. The ids are logged at construction
   * so drift is visible in a boot log rather than in a support ticket.
   *
   * VISION DEFAULTS TO qwen3-vl, NOT NuExtract3, and that is deliberate.
   * NuExtract3 is the better extraction model and CASE_VERIFICATION_ENGINE.md
   * §8 recommends it. The precise problem, measured rather than assumed
   * (docs/gpu-api-contract.md §3): for a required field the prompt does not
   * explicitly ask for, NuExtract3 returns the schema's own type name -- the
   * literal string "string" -- instead of extracting the value or omitting the
   * field. Ask it for both fields and it is correct; ask it for one and the
   * other comes back as "string".
   *
   * That is not an edge case here. A real extraction schema has many fields and
   * no prompt enumerates every one, the answer is schema-valid so constrained
   * decoding cannot catch it, and it is the exact inverse of the abstention
   * rule in §8 -- a guess that looks deliberate, where absence was required.
   *
   * Switching the default needs this class to send NuExtract3's native template
   * (or to name every field), and to treat a returned type name as an
   * extraction failure rather than a value. Until then, a slightly weaker model
   * that is correct under our calling convention beats a stronger one that is
   * not.
   */
  readonly defaultModel: string;
  readonly visionModel: string;
  private readonly reasoningModel: string;

  constructor(private readonly configService: ConfigService) {
    this.configuredUrl = this.url('GPU_SERVICE_URL');
    this.suryaUrl = this.url('SURYA_SERVICE_URL');

    this.defaultModel = this.model('GPU_MODEL_TEXT', 'gpt-oss:20b');
    this.visionModel = this.model('GPU_MODEL_VISION', 'qwen3-vl:8b');
    this.reasoningModel = this.model('GPU_MODEL_REASONING', this.defaultModel);

    this.logger.log(
      `Models: text=${this.defaultModel} vision=${this.visionModel} ` +
        `reasoning=${this.reasoningModel}` +
        (this.configuredUrl ? '' : ' (no GPU_SERVICE_URL; calls will fail)') +
        (this.suryaUrl ? '' : ' (no SURYA_SERVICE_URL; OCR will fail)')
    );
  }

  private url(key: string): string | undefined {
    return this.configService.get<string>(key)?.trim().replace(/\/+$/, '') || undefined;
  }

  private model(key: string, fallback: string): string {
    return this.configService.get<string>(key)?.trim() || fallback;
  }

  /**
   * A base URL, or a loud failure — resolved per call rather than in the
   * constructor.
   *
   * Both halves of that matter. Throwing is right: the missing default used to
   * be a hardcoded Cloudflare quick-tunnel that had long since expired, so an
   * unconfigured service silently addressed a dead host and surfaced as
   * confusing failures much further downstream. SURYA_SERVICE_URL gets the same
   * treatment for the same reason — a default would be a guess about a machine
   * this code cannot see.
   *
   * Throwing *here* rather than in the constructor is the other half.
   * `LlmModule` lists this class in `providers` and injects it into the factory
   * that picks between backends, so Nest instantiates it eagerly whichever
   * backend wins — and a constructor throw took down the whole of risk-engine at
   * boot for anyone running Gemini, or running neither. Failing on first use
   * keeps the loud failure and confines it to the path that needs a GPU.
   */
  private require(value: string | undefined, key: string, what: string): string {
    if (!value) {
      throw new Error(
        `${key} is not set. OllamaGpuLlmProvider has no default endpoint for ${what} — ` +
          'see .env.example and docs/GPU_HOST_SETUP.md.'
      );
    }
    return value;
  }

  /** Whether generation can be served. OCR is configured separately. */
  isConfigured(): boolean {
    return Boolean(this.configuredUrl);
  }

  /** Whether OCR can be served. Surya is a separate service from Ollama. */
  isOcrConfigured(): boolean {
    return Boolean(this.suryaUrl);
  }

  /**
   * OCR via Surya, including the geometry that makes an extraction auditable.
   *
   * Surya is discriminative: it reads what is on the page and cannot invent
   * text that is not, which is exactly why the page and bounding box required
   * by CASE_VERIFICATION_ENGINE.md §8 come from here and never from asking a
   * language model for coordinates.
   *
   * Only `/ocr` is called. `/analyze` accepts the identical request but returns
   * bank-statement fields — bank_name, transactions, opening_balance — because
   * it belongs to the `finura` loan-application domain, not to claims. There is
   * no `/predict`, despite what an earlier draft of the probe assumed
   * (docs/gpu-api-contract.md §5).
   */
  async ocr(fileBuffer: Buffer, filename: string): Promise<OcrResult> {
    const base = this.require(this.suryaUrl, 'SURYA_SERVICE_URL', 'OCR');

    // Exactly one part, named `file`. The contract records no engine selector
    // and no options; the old `engine=surya` part was part of the /v3 API.
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(fileBuffer)]), filename);

    const body = await this.send(`${base}/ocr`, { method: 'POST', body: form as any });
    return this.toOcrResult(body);
  }

  private toOcrResult(body: any): OcrResult {
    const pages: OcrPage[] = (Array.isArray(body?.pages) ? body.pages : []).map(
      (page: any, index: number) => {
        const lines: OcrLine[] = (Array.isArray(page?.text_lines) ? page.text_lines : [])
          .filter((line: any) => typeof line?.text === 'string')
          .map((line: any) => ({
            text: line.text,
            confidence: typeof line.confidence === 'number' ? line.confidence : 0,
            bbox: this.toBbox(line.bbox),
          }));

        return {
          // Surya numbers pages from 1; fall back to position rather than
          // emitting page 0, which would read as "unknown" downstream.
          page: typeof page?.page === 'number' ? page.page : index + 1,
          lines,
          fullText:
            typeof page?.full_text === 'string'
              ? page.full_text
              : lines.map((line) => line.text).join('\n'),
        };
      }
    );

    return { text: pages.map((page) => page.fullText).join('\n').trim(), pages };
  }

  private toBbox(value: unknown): [number, number, number, number] {
    // [x0, y0, x1, y1] in pixels. A malformed box becomes zeroes rather than
    // throwing: losing one line's geometry must not lose the whole document,
    // and a zero-area box is visibly not a location.
    return Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === 'number')
      ? (value as [number, number, number, number])
      : [0, 0, 0, 0];
  }

  async generateJson(prompt: string, model = this.defaultModel): Promise<any> {
    return this.chat(model, [{ role: 'user', content: prompt }]);
  }

  async visionJson(
    prompt: string,
    fileBuffer: Buffer,
    filename: string,
    model = this.visionModel
  ): Promise<any> {
    // filename is not sent: Ollama takes the image as base64 on the message and
    // has nowhere to put a name. Kept in the signature because the interface is
    // shared with Gemini, whose API does use it.
    void filename;
    return this.chat(model, [
      { role: 'user', content: prompt, images: [fileBuffer.toString('base64')] },
    ]);
  }

  async reasoningJson(prompt: string, model = this.reasoningModel): Promise<any> {
    // Routed to the text model by default rather than pulling a third one. The
    // verification design has no step where a model holds a verdict, and only
    // one or two models fit in 24 GB at once — alternating pays a reload each
    // time (docs/gpu-api-contract.md §7).
    return this.chat(model, [{ role: 'user', content: prompt }]);
  }

  /**
   * One call shape for every job: POST /api/chat, non-streaming, JSON out.
   *
   * `temperature: 0` is not a tuning choice. CASE_VERIFICATION_ENGINE.md §9
   * requires that re-running a case six months later does not silently produce
   * a different answer, which a sampled decode cannot promise. It replaces the
   * 0.3 the reasoning path used to send.
   */
  private async chat(model: string, messages: Array<Record<string, unknown>>): Promise<any> {
    const base = this.require(this.configuredUrl, 'GPU_SERVICE_URL', 'generation');

    const body = await this.send(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_ctx: OllamaGpuLlmProvider.NUM_CTX },
      }),
    });

    return this.parseContent(body, model);
  }

  /**
   * Ollama returns the answer as a *string* on message.content, even under
   * `format`. Callers of this interface expect parsed fields, so the parse
   * happens here — and a failure names the model, because which model produced
   * unparseable output is the first thing anyone debugging this needs.
   */
  private parseContent(body: any, model: string): any {
    const content = body?.message?.content;
    if (typeof content !== 'string') {
      throw new Error(
        `Ollama returned no message content for model ${model}. ` +
          `Got: ${JSON.stringify(body)?.slice(0, 200)}`
      );
    }

    try {
      return JSON.parse(content);
    } catch {
      throw new Error(
        `Ollama returned unparseable JSON for model ${model}: ${content.slice(0, 200)}`
      );
    }
  }

  private async send(url: string, init: RequestInit): Promise<any> {
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No error body');
        this.logger.error(`GPU API Error [${url}] Status: ${response.status} Body: ${errorBody}`);
        throw new Error(`GPU API Error: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      this.logger.error(`GPU Call Failed [${url}]: ${error}`);
      throw error;
    }
  }
}
