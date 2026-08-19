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
  readonly defaultModel = 'qwen2.5:7b';

  constructor(private readonly configService: ConfigService) {
    this.configuredUrl = this.configService
      .get<string>('GPU_SERVICE_URL')
      ?.trim()
      .replace(/\/+$/, '');
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
    model = 'qwen2.5vl:7b'
  ): Promise<any> {
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, filename);
    formData.append('prompt', prompt);
    formData.append('model', model);
    formData.append('format', 'json');
    return this.post('/v3/llm/vision', formData);
  }

  async reasoningJson(prompt: string, model = 'deepseek-r1:14b'): Promise<any> {
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
