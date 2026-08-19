import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LLM_PROVIDER, LlmProvider } from './llm-provider.interface';
import { OllamaGpuLlmProvider } from './ollama-gpu-llm.provider';
import { GeminiLlmProvider } from './gemini-llm.provider';
import { AnswerNormaliserController } from './answer-normaliser.controller';
import { AnswerNormaliserService } from './answer-normaliser.service';

/**
 * LLM module — registers both providers and binds LLM_PROVIDER at boot.
 *
 * LOCAL BY DEFAULT. Selection is now:
 *  1. LLM_PROVIDER=gemini  → Gemini, chosen deliberately and offshore
 *  2. anything else        → the local models on the GPU host
 *
 * The rule it replaces was "GEMINI_API_KEY present → Gemini", which meant a key
 * left in a .env file was enough to route claimant documents to Google without
 * anyone deciding to. That is the same shape as the two defaults this branch
 * removed — a dead Cloudflare tunnel and three stale model ids — a value that
 * was true once and silently kept deciding something important. Sending
 * personal data across a border is the last thing that should happen by
 * default, and no cross-border basis is established (MASTER_PLAN §3.4).
 *
 * An unrecognised value falls back to local rather than throwing: a typo must
 * not take risk-engine down at boot, and the safe direction for a config error
 * is the one where nothing leaves the machine. It is logged loudly.
 *
 * The choice lives in `resolveLlmProvider` rather than inline in the factory
 * so it can be tested; see llm.module.spec.ts.
 *
 * Marked @Global so any module can inject @Inject(LLM_PROVIDER) without
 * importing LlmModule explicitly.
 */
export function resolveLlmProvider(
  config: ConfigService,
  ollama: LlmProvider,
  gemini: LlmProvider,
  logger: Logger = new Logger('LlmModule')
): LlmProvider {
  const explicit = config.get<string>('LLM_PROVIDER')?.trim().toLowerCase();

  if (explicit === 'gemini') {
    logger.warn(
      'LLM_PROVIDER=gemini — document and intake text will be sent to Google, ' +
        'outside Malaysia. No cross-border basis is established (MASTER_PLAN §3.4). ' +
        'Synthetic and internal-tester data only.'
    );
    return gemini;
  }

  if (explicit && explicit !== 'ollama') {
    logger.warn(
      `LLM_PROVIDER='${explicit}' is not recognised — using the local provider. ` +
        "Valid values are 'ollama' (default) and 'gemini'."
    );
  }

  logger.log('Using the local provider (OllamaGpu). Nothing is sent offshore.');
  return ollama;
}

@Global()
@Module({
  controllers: [AnswerNormaliserController],
  providers: [
    AnswerNormaliserService,
    OllamaGpuLlmProvider,
    GeminiLlmProvider,
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService, OllamaGpuLlmProvider, GeminiLlmProvider],
      useFactory: (
        config: ConfigService,
        ollama: OllamaGpuLlmProvider,
        gemini: GeminiLlmProvider
      ): LlmProvider => resolveLlmProvider(config, ollama, gemini),
    },
  ],
  exports: [LLM_PROVIDER, OllamaGpuLlmProvider, GeminiLlmProvider, AnswerNormaliserService],
})
export class LlmModule {}
