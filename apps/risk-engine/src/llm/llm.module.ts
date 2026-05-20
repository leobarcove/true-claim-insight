import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER, LlmProvider } from './llm-provider.interface';
import { OllamaGpuLlmProvider } from './ollama-gpu-llm.provider';
import { GeminiLlmProvider } from './gemini-llm.provider';

/**
 * LLM module — registers both providers and binds LLM_PROVIDER to the
 * selected backend at boot. Selection priority:
 *  1. process.env.LLM_PROVIDER explicitly set ('gemini' | 'ollama')
 *  2. process.env.GEMINI_API_KEY present → default to gemini
 *  3. otherwise → ollama (self-hosted)
 *
 * Marked @Global so any module can inject @Inject(LLM_PROVIDER) without
 * importing LlmModule explicitly.
 */
@Global()
@Module({
  providers: [
    OllamaGpuLlmProvider,
    GeminiLlmProvider,
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService, OllamaGpuLlmProvider, GeminiLlmProvider],
      useFactory: (
        config: ConfigService,
        ollama: OllamaGpuLlmProvider,
        gemini: GeminiLlmProvider
      ): LlmProvider => {
        const explicit = config.get<string>('LLM_PROVIDER')?.toLowerCase();
        if (explicit === 'ollama') return ollama;
        if (explicit === 'gemini') return gemini;
        if (config.get<string>('GEMINI_API_KEY')) return gemini;
        return ollama;
      },
    },
  ],
  exports: [LLM_PROVIDER, OllamaGpuLlmProvider, GeminiLlmProvider],
})
export class LlmModule {}
