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
    // Need to use 'form-data' or similar if using axios, or just fetch with FormData
    // Implementing using native fetch (Node 18+)
    const formData = new FormData();
    const blob = new Blob([fileBuffer]);
    formData.append('file', blob, filename);
    formData.append('engine', 'surya');

    return this.post('/v3/ocr', formData);
  }

  async generateJson(prompt: string, model = 'qwen2.5:7b'): Promise<any> {
    const body = {
      prompt,
      model,
      format: 'json',
    };
    return this.postData('/v3/llm/generate', body);
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
    const body = {
      prompt,
      model,
      stream: false,
      options: { temperature: 0.3 }, // Low temp for analytical tasks
    };
    return this.postData('/v3/llm/generate', body);
  }

  private async post(endpoint: string, body: FormData): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        body: body as any, // TypeScript might complain about FormData in fetch depending on lib config
      });
      if (!response.ok) {
        throw new Error(`GPU API Error: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      this.logger.error(`GPU Call Failed [${endpoint}]: ${error}`);
      throw error;
    }
  }

  private async postData(endpoint: string, data: any): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      if (!response.ok) {
        throw new Error(`GPU API Error: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      this.logger.error(`GPU Call Failed [${endpoint}]: ${error}`);
      throw error;
    }
  }
}
