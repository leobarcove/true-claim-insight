import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmProvider } from './llm-provider.interface';

/**
 * LlmProvider impl backed by the self-hosted Qwen / DeepSeek GPU service.
 *
 * DATA SOVEREIGNTY STATUS: not yet achieved. The intended benefit is keeping
 * claimant documents on Malaysian infrastructure, but the default endpoint
 * below is an ephemeral Cloudflare quick-tunnel, so traffic egresses through
 * Cloudflare and the host is not a stable in-country deployment. Provisioning
 * real local infrastructure and making this the default for PII documents is
 * Phase 2 of docs/MASTER_PLAN.md. Do not describe this path as PDPA-compliant
 * until GPU_SERVICE_URL points at controlled in-country infrastructure.
 *
 * Refactored from the original GpuClientService — same network calls,
 * now behind the LlmProvider interface so it can be swapped via the
 * LLM_PROVIDER DI token.
 */
@Injectable()
export class OllamaGpuLlmProvider implements LlmProvider {
  private readonly logger = new Logger(OllamaGpuLlmProvider.name);
  private readonly baseUrl: string;

  readonly name = 'OllamaGpu';
  readonly defaultModel = 'qwen2.5:7b';

  constructor(private readonly configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'GPU_SERVICE_URL',
      'https://begins-bottles-nicholas-resulted.trycloudflare.com'
    );
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
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
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
