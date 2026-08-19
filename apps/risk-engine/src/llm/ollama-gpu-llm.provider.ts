import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './llm-provider.interface';

/**
 * LlmProvider impl backed by the self-hosted Qwen / DeepSeek GPU service.
 *
 * DATA SOVEREIGNTY STATUS: not yet achieved. The intended benefit is keeping
 * claimant documents on Malaysian infrastructure. GPU_SERVICE_URL currently
 * points at an office desktop reached over a private tailnet
 * (docs/GPU_HOST_SETUP.md) — a machine somebody may reboot, not controlled
 * in-country infrastructure. Do not describe this path as PDPA-compliant
 * until it is; docs/MASTER_PLAN.md §3.4 is unchanged by the local-LLM work.
 *
 * GPU_SERVICE_URL is REQUIRED and has no default. It used to fall back to a
 * hardcoded Cloudflare quick-tunnel which had long since expired, so a missing
 * configuration silently addressed a dead host and surfaced as confusing
 * downstream failures. Fail loudly instead; do not reintroduce a default.
 *
 * Refactored from the original GpuClientService — same network calls,
 * now behind the LlmProvider interface so it can be swapped via the
 * LLM_PROVIDER DI token.
 */
@Injectable()
export class OllamaGpuLlmProvider implements LlmProvider {
  private readonly logger = new Logger(OllamaGpuLlmProvider.name);
  private readonly configuredUrl?: string;

  readonly name = 'OllamaGpu';

  /**
   * Model ids, from configuration rather than baked in.
   *
   * These were literals -- 'qwen2.5:7b', 'qwen2.5vl:7b', 'deepseek-r1:14b' --
   * and by the time the host was surveyed not one of them was on it. That is
   * the same bug as the Cloudflare quick-tunnel this class used to default to:
   * a hardcoded value that was true when written and silently stopped being
   * true, with nothing in the code able to notice.
   *
   * Defaults are the tags verified against the Ollama registry and pulled onto
   * the host on 19 August 2026 (docs/GPU_HOST_SETUP.md). Unlike the tunnel,
   * a wrong model id fails legibly -- Ollama answers "model not found" -- so a
   * default is safe here in a way it was not there. The ids are logged at
   * construction so drift is visible in a boot log rather than in a support
   * ticket.
   *
   * VISION DEFAULTS TO qwen3-vl, NOT NuExtract3, and that is deliberate.
   * NuExtract3 is the better extraction model and CASE_VERIFICATION_ENGINE.md
   * section 8 recommends it -- but only when asked with its own native
   * template. Asked the way this class asks, an instruction plus Ollama's
   * `format` schema, it echoes the schema's type name into the answer:
   * {"flight_number": "string", "delay_hours": 6}. That is schema-valid, wrong,
   * and would pass a naive check. Defaulting to a model that returns confident
   * nonsense under our own calling convention is worse than defaulting to a
   * slightly weaker one that is correct under it.
   *
   * Switch the default the day this class learns to send NuExtract3's template
   * -- which belongs with the /v3 rework in GPU_HOST_SETUP.md section 7, since
   * the calling convention is a property of the model and this class currently
   * assumes there is only one.
   */
  readonly defaultModel: string;
  private readonly visionModel: string;
  private readonly reasoningModel: string;

  constructor(private readonly configService: ConfigService) {
    this.configuredUrl = this.configService
      .get<string>('GPU_SERVICE_URL')
      ?.trim()
      .replace(/\/+$/, '');

    this.defaultModel = this.model('GPU_MODEL_TEXT', 'gpt-oss:20b');
    this.visionModel = this.model('GPU_MODEL_VISION', 'qwen3-vl:8b');
    this.reasoningModel = this.model('GPU_MODEL_REASONING', this.defaultModel);

    this.logger.log(
      `Models: text=${this.defaultModel} vision=${this.visionModel} ` +
        `reasoning=${this.reasoningModel}` +
        (this.configuredUrl ? '' : ' (no GPU_SERVICE_URL; calls will fail)')
    );
  }

  private model(key: string, fallback: string): string {
    return this.configService.get<string>(key)?.trim() || fallback;
  }

  /**
   * The endpoint, or a loud failure — resolved per call rather than in the
   * constructor.
   *
   * Both halves of that matter. Throwing is right: the missing default used to
   * be a hardcoded Cloudflare quick-tunnel that had long since expired, so an
   * unconfigured service silently addressed a dead host and surfaced as
   * confusing failures much further downstream.
   *
   * Throwing *here* rather than in the constructor is the other half. `LlmModule`
   * lists this class in `providers` and injects it into the factory that picks
   * between backends, so Nest instantiates it eagerly whichever backend wins —
   * and a constructor throw took down the whole of risk-engine at boot for
   * anyone running Gemini, or running neither. Failing on first use keeps the
   * loud failure and confines it to the path that actually needs a GPU.
   */
  private endpoint(): string {
    if (!this.configuredUrl) {
      throw new Error(
        'GPU_SERVICE_URL is not set. OllamaGpuLlmProvider has no default endpoint — ' +
          'see .env.example and docs/GPU_HOST_SETUP.md.'
      );
    }
    return this.configuredUrl;
  }

  /** Whether this provider can serve a request at all. */
  isConfigured(): boolean {
    return Boolean(this.configuredUrl);
  }

  async ocr(fileBuffer: Buffer, filename: string): Promise<{ text: string }> {
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, filename);
    formData.append('engine', 'surya');
    const resp = await this.post('/v3/ocr', formData);
    return { text: resp?.text ?? '' };
  }

  async generateJson(prompt: string, model = this.defaultModel): Promise<any> {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', model);
    formData.append('format', 'json');
    return this.post('/v3/llm/generate', formData);
  }

  async visionJson(
    prompt: string,
    fileBuffer: Buffer,
    filename: string,
    model = this.visionModel
  ): Promise<any> {
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, filename);
    formData.append('prompt', prompt);
    formData.append('model', model);
    formData.append('format', 'json');
    return this.post('/v3/llm/vision', formData);
  }

  async reasoningJson(prompt: string, model = this.reasoningModel): Promise<any> {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('model', model);
    formData.append('stream', 'false');
    formData.append('options', JSON.stringify({ temperature: 0.3 }));
    return this.post('/v3/llm/generate', formData);
  }

  private async post(endpoint: string, body: FormData): Promise<any> {
    // Resolved before the try, so a missing GPU_SERVICE_URL is reported as the
    // configuration error it is rather than being logged as "GPU Call Failed" —
    // which would send whoever reads it looking at the network.
    const base = this.endpoint();

    try {
      const response = await fetch(`${base}${endpoint}`, {
        method: 'POST',
        body: body as any,
      });
      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'No error body');
        this.logger.error(
          `GPU API Error [${endpoint}] Status: ${response.status} Body: ${errorBody}`
        );
        throw new Error(`GPU API Error: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      this.logger.error(`GPU Call Failed [${endpoint}]: ${error}`);
      throw error;
    }
  }
}
