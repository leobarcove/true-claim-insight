import { ConfigService } from '@nestjs/config';

import { OllamaGpuLlmProvider } from './ollama-gpu-llm.provider';

/**
 * REGRESSION TEST — an unconfigured GPU must not stop risk-engine booting.
 *
 * `LlmModule` lists this class in `providers` and injects it into the factory
 * that chooses between backends, so Nest instantiates it eagerly *whichever*
 * backend wins. A constructor that threw on a missing `GPU_SERVICE_URL`
 * therefore took down the whole service at boot for anyone running Gemini, or
 * running neither — which is every developer without a GPU, and staging.
 *
 * The loud failure is still wanted. The default it replaced was a hardcoded
 * Cloudflare quick-tunnel that had long since expired, so an unconfigured
 * service silently addressed a dead host. It just has to happen on the path
 * that needs a GPU, not on the path to starting up.
 *
 * The full suite passed through that regression, because nothing in it
 * instantiates the module.
 */
const config = (env: Record<string, string> = {}) => new ConfigService(env);

describe('a GPU endpoint that is not configured', () => {
  it('does not prevent construction', () => {
    // The boot path. If this throws, risk-engine does not start.
    expect(() => new OllamaGpuLlmProvider(config())).not.toThrow();
  });

  it('reports itself as unconfigured', () => {
    expect(new OllamaGpuLlmProvider(config()).isConfigured()).toBe(false);
  });

  it('fails loudly when a call is actually attempted', async () => {
    const provider = new OllamaGpuLlmProvider(config());
    await expect(provider.generateJson('anything')).rejects.toThrow(/GPU_SERVICE_URL is not set/);
  });

  it('names where to look', async () => {
    // A message that says only "not set" sends the reader hunting. This one
    // points at the two files that answer the question.
    const provider = new OllamaGpuLlmProvider(config());
    await expect(provider.generateJson('anything')).rejects.toThrow(/\.env\.example/);
    await expect(provider.generateJson('anything')).rejects.toThrow(/GPU_HOST_SETUP\.md/);
  });
});

describe('a GPU endpoint that is configured', () => {
  it('is reported as configured', () => {
    const provider = new OllamaGpuLlmProvider(config({ GPU_SERVICE_URL: 'http://gpu:11434' }));
    expect(provider.isConfigured()).toBe(true);
  });

  it('tolerates a trailing slash', () => {
    // Every path this class builds starts with '/', so a configured value
    // ending in one would produce '//v3/ocr'. Cheap to absorb, and the sort of
    // thing that gets pasted in from a browser address bar.
    const provider = new OllamaGpuLlmProvider(config({ GPU_SERVICE_URL: 'http://gpu:11434///' }));
    expect((provider as unknown as { configuredUrl: string }).configuredUrl).toBe(
      'http://gpu:11434'
    );
  });

  it('does not treat whitespace as configuration', () => {
    expect(new OllamaGpuLlmProvider(config({ GPU_SERVICE_URL: '   ' })).isConfigured()).toBe(false);
  });
});

/**
 * REGRESSION TEST — a model id must not be a constant that was true once.
 *
 * The three ids here were literals: 'qwen2.5:7b', 'qwen2.5vl:7b' and
 * 'deepseek-r1:14b'. By the time the host was surveyed none of them was on it,
 * and nothing in the code could notice. That is the same failure as the
 * hardcoded Cloudflare quick-tunnel this class used to default to.
 */
describe('model ids come from configuration', () => {
  it('uses the configured id for each job', () => {
    const provider = new OllamaGpuLlmProvider(
      config({
        GPU_MODEL_TEXT: 'text-model',
        GPU_MODEL_VISION: 'vision-model',
        GPU_MODEL_REASONING: 'reasoning-model',
      })
    );
    const internals = provider as unknown as { visionModel: string; reasoningModel: string };
    expect(provider.defaultModel).toBe('text-model');
    expect(internals.visionModel).toBe('vision-model');
    expect(internals.reasoningModel).toBe('reasoning-model');
  });

  it('falls back to the tags actually pulled onto the host', () => {
    const provider = new OllamaGpuLlmProvider(config());
    const internals = provider as unknown as { visionModel: string };
    expect(provider.defaultModel).toBe('gpt-oss:20b');
    // Deliberately qwen3-vl and not the better NuExtract3: this class asks with
    // an instruction plus a JSON schema, and under that convention NuExtract3
    // returns the schema's type name as the value -- schema-valid and wrong.
    expect(internals.visionModel).toBe('qwen3-vl:8b');
  });

  it('names no model that was removed from the host', () => {
    const provider = new OllamaGpuLlmProvider(config());
    const internals = provider as unknown as { visionModel: string; reasoningModel: string };
    const stale = ['qwen2.5:7b', 'qwen2.5vl:7b', 'deepseek-r1:14b'];
    for (const id of [provider.defaultModel, internals.visionModel, internals.reasoningModel]) {
      expect(stale).not.toContain(id);
    }
  });

  it('treats blank configuration as absent', () => {
    const provider = new OllamaGpuLlmProvider(config({ GPU_MODEL_TEXT: '  ' }));
    expect(provider.defaultModel).toBe('gpt-oss:20b');
  });
});
