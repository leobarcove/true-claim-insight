import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GpuClientService {
  private readonly logger = new Logger(GpuClientService.name);
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>(
      'GPU_SERVICE_URL',
      'https://thirty-clearly-pillow-considering.trycloudflare.com'
    );
  }

  async ocr(fileBuffer: Buffer, filename: string): Promise<any> {
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, filename);
    formData.append('engine', 'surya');

    return this.post('/v3/ocr', formData);
  }

  async generateJson(prompt: string, model = 'qwen2.5:7b'): Promise<any> {
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
