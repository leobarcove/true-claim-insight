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
