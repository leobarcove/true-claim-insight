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
    // ending in one would produce '//api/chat'. Cheap to absorb, and the sort
    // of thing that gets pasted in from a browser address bar.
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
    const internals = provider as unknown as { reasoningModel: string };
    expect(provider.defaultModel).toBe('text-model');
    expect(provider.visionModel).toBe('vision-model');
    expect(internals.reasoningModel).toBe('reasoning-model');
  });

  it('falls back to the tags actually pulled onto the host', () => {
    const provider = new OllamaGpuLlmProvider(config());
    expect(provider.defaultModel).toBe('gpt-oss:20b');
    // Deliberately qwen3-vl and not the better NuExtract3. Narrower reason than
    // once recorded here: NuExtract3 is correct when the prompt names every
    // required field, and returns the schema's own type name for any required
    // field the prompt does not name (docs/gpu-api-contract.md section 3).
    expect(provider.visionModel).toBe('qwen3-vl:8b');
  });

  it('names no model that was removed from the host', () => {
    const provider = new OllamaGpuLlmProvider(config());
    const internals = provider as unknown as { reasoningModel: string };
    const stale = ['qwen2.5:7b', 'qwen2.5vl:7b', 'deepseek-r1:14b'];
    for (const id of [provider.defaultModel, provider.visionModel, internals.reasoningModel]) {
      expect(stale).not.toContain(id);
    }
  });

  it('treats blank configuration as absent', () => {
    const provider = new OllamaGpuLlmProvider(config({ GPU_MODEL_TEXT: '  ' }));
    expect(provider.defaultModel).toBe('gpt-oss:20b');
  });
});

/**
 * THE REWRITE — this class must speak the API that actually runs on the host.
 *
 * It used to call /v3/ocr, /v3/llm/generate and /v3/llm/vision. That API was
 * never Ollama's: it belonged to the halted `finura` backend on the same
 * desktop, so a perfectly configured GPU_SERVICE_URL still failed on every
 * call. What runs there was probed on 19 August 2026 and recorded in
 * docs/gpu-api-contract.md; these tests hold the client to that record.
 *
 * No socket is opened — fetch is replaced. The point is the request shape,
 * which is the half that was wrong before and that no amount of running the
 * old code would have revealed.
 */
type Captured = { url: string; init: RequestInit };

const captureFetch = (payload: unknown) => {
  const calls: Captured[] = [];
  global.fetch = jest.fn(async (url: any, init: any) => {
    calls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => payload } as any;
  }) as any;
  return calls;
};

const bodyOf = (call: Captured) => JSON.parse(String(call.init.body));

const chatReply = (content: unknown) => ({ message: { content: JSON.stringify(content) } });

const configured = () =>
  new OllamaGpuLlmProvider(
    config({ GPU_SERVICE_URL: 'http://gpu:11434', SURYA_SERVICE_URL: 'http://gpu:8002' })
  );

afterEach(() => {
  jest.restoreAllMocks();
});

describe('generation goes to Ollama, not to /v3', () => {
  it('posts to /api/chat', async () => {
    const calls = captureFetch(chatReply({ delay_hours: 6 }));
    await configured().generateJson('how long');
    expect(calls[0].url).toBe('http://gpu:11434/api/chat');
  });

  it('names no /v3 route on any path', async () => {
    // The whole defect in one assertion: every one of these used to be /v3.
    const calls = captureFetch(chatReply({ ok: true }));
    const provider = configured();
    await provider.generateJson('a');
    await provider.reasoningJson('b');
    await provider.visionJson('c', Buffer.from('img'), 'p.png');
    await provider.ocr(Buffer.from('img'), 'p.png');
    expect(calls.map((c) => c.url).join(' ')).not.toContain('/v3');
  });

  it('unwraps the answer from message.content', async () => {
    // Ollama returns the JSON as a *string* on message.content even under
    // `format`. Callers of this interface expect parsed fields.
    captureFetch(chatReply({ flight_number: 'MH168', delay_hours: 6 }));
    await expect(configured().generateJson('x')).resolves.toEqual({
      flight_number: 'MH168',
      delay_hours: 6,
    });
  });

  it('asks for a deterministic decode', async () => {
    // temperature 0 is not tuning. CASE_VERIFICATION_ENGINE.md §9 requires that
    // re-running a case later does not silently produce a different answer.
    const calls = captureFetch(chatReply({}));
    await configured().generateJson('x');
    expect(bodyOf(calls[0]).options.temperature).toBe(0);
    expect(bodyOf(calls[0]).stream).toBe(false);
  });

  it('sends a context window large enough for a document', async () => {
    // Ollama truncates silently past num_ctx, losing the tail of a long
    // document with no error at all.
    const calls = captureFetch(chatReply({}));
    await configured().generateJson('x');
    expect(bodyOf(calls[0]).options.num_ctx).toBe(8192);
  });

  it('routes each job to its own model', async () => {
    const calls = captureFetch(chatReply({}));
    const provider = configured();
    await provider.generateJson('a');
    await provider.visionJson('b', Buffer.from('img'), 'p.png');
    expect(bodyOf(calls[0]).model).toBe('gpt-oss:20b');
    expect(bodyOf(calls[1]).model).toBe('qwen3-vl:8b');
  });

  it('reasons on the text model rather than pulling a third one', async () => {
    // Only one or two models fit in 24 GB at once, so alternating pays a
    // reload each time (docs/gpu-api-contract.md §7). The verification design
    // has no step where a model holds a verdict.
    const calls = captureFetch(chatReply({}));
    const provider = configured();
    await provider.reasoningJson('a');
    expect(bodyOf(calls[0]).model).toBe('gpt-oss:20b');
    // It also used to sample at 0.3, which no audit can reproduce.
    expect(bodyOf(calls[0]).options.temperature).toBe(0);
  });

  it('sends the image as base64 on the message', async () => {
    const calls = captureFetch(chatReply({}));
    await configured().visionJson('read it', Buffer.from('PNGDATA'), 'page.png');
    expect(bodyOf(calls[0]).messages[0].images).toEqual([
      Buffer.from('PNGDATA').toString('base64'),
    ]);
  });

  it('reports which model produced unparseable output', async () => {
    // Without the model id the reader cannot tell a bad prompt from a bad
    // model, and these are different models per job.
    captureFetch({ message: { content: 'Sure! Here is the JSON:' } });
    await expect(configured().generateJson('x')).rejects.toThrow(/gpt-oss:20b/);
  });

  it('fails when Ollama returns no content at all', async () => {
    captureFetch({ error: 'model not found' });
    await expect(configured().generateJson('x')).rejects.toThrow(/no message content/);
  });
});

describe('OCR goes to Surya, which is a different service', () => {
  const suryaReply = {
    status: 'success',
    pages: [
      {
        page: 1,
        text_lines: [
          { text: 'MH168 DELAY 6H', confidence: 0.955, bbox: [22.0, 80.0, 371.0, 108.0] },
        ],
        full_text: 'MH168 DELAY 6H',
      },
    ],
    total_lines: 1,
  };

  it('needs its own base URL', () => {
    // The /v3 client assumed one URL fronted both services. It does not: Ollama
    // is :11434 and Surya is :8002.
    const provider = new OllamaGpuLlmProvider(config({ GPU_SERVICE_URL: 'http://gpu:11434' }));
    expect(provider.isConfigured()).toBe(true);
    expect(provider.isOcrConfigured()).toBe(false);
  });

  it('fails loudly rather than defaulting when that URL is missing', async () => {
    // Same reasoning as GPU_SERVICE_URL, which spent months defaulting to a
    // dead Cloudflare tunnel. A default here would be a guess about a machine
    // this code cannot see.
    const provider = new OllamaGpuLlmProvider(config({ GPU_SERVICE_URL: 'http://gpu:11434' }));
    await expect(provider.ocr(Buffer.from('x'), 'p.png')).rejects.toThrow(
      /SURYA_SERVICE_URL is not set/
    );
  });

  it('does not silently fall back to the Ollama endpoint', async () => {
    const provider = new OllamaGpuLlmProvider(config({ GPU_SERVICE_URL: 'http://gpu:11434' }));
    await expect(provider.ocr(Buffer.from('x'), 'p.png')).rejects.toThrow(/SURYA_SERVICE_URL/);
  });

  it('posts multipart to /ocr', async () => {
    const calls = captureFetch(suryaReply);
    await configured().ocr(Buffer.from('img'), 'page.png');
    expect(calls[0].url).toBe('http://gpu:8002/ocr');
    expect(calls[0].init.body).toBeInstanceOf(FormData);
  });

  it('sends exactly one part, named file', async () => {
    // The contract records no engine selector and no options; the old
    // `engine=surya` part belonged to the /v3 API.
    const calls = captureFetch(suryaReply);
    await configured().ocr(Buffer.from('img'), 'page.png');
    const form = calls[0].init.body as unknown as FormData;
    expect([...form.keys()]).toEqual(['file']);
  });

  it('never calls /analyze', async () => {
    // /analyze takes the identical request but answers with bank_name,
    // transactions and opening_balance -- finura's loan domain, not claims.
    const calls = captureFetch(suryaReply);
    await configured().ocr(Buffer.from('img'), 'page.png');
    expect(calls[0].url).not.toContain('/analyze');
    expect(calls[0].url).not.toContain('/predict');
  });

  it('returns the text the extraction prompt consumes', async () => {
    captureFetch(suryaReply);
    await expect(configured().ocr(Buffer.from('i'), 'p.png')).resolves.toMatchObject({
      text: 'MH168 DELAY 6H',
    });
  });

  it('keeps the per-line grounding', async () => {
    // CASE_VERIFICATION_ENGINE.md §8 requires every extracted field to carry a
    // page and a bounding box. Surya is the only thing in this pipeline that
    // can supply it -- it is discriminative and cannot invent text that is not
    // on the page. Discarding it here would make it unrecoverable later.
    captureFetch(suryaReply);
    const result = await configured().ocr(Buffer.from('i'), 'p.png');
    expect(result.pages?.[0]).toEqual({
      page: 1,
      fullText: 'MH168 DELAY 6H',
      lines: [{ text: 'MH168 DELAY 6H', confidence: 0.955, bbox: [22.0, 80.0, 371.0, 108.0] }],
    });
  });

  it('joins multiple pages in order', async () => {
    captureFetch({
      status: 'success',
      pages: [
        { page: 1, text_lines: [], full_text: 'first' },
        { page: 2, text_lines: [], full_text: 'second' },
      ],
    });
    const result = await configured().ocr(Buffer.from('i'), 'p.pdf');
    expect(result.text).toBe('first\nsecond');
    expect(result.pages?.map((p) => p.page)).toEqual([1, 2]);
  });

  it('survives a line whose geometry is malformed', async () => {
    // Losing one line's box must not lose the document. A zero-area box is
    // visibly not a location, which a wrong-but-plausible one would not be.
    captureFetch({
      pages: [{ page: 1, text_lines: [{ text: 'ok', confidence: 0.9, bbox: [1, 2] }] }],
    });
    const result = await configured().ocr(Buffer.from('i'), 'p.png');
    expect(result.pages?.[0].lines[0].bbox).toEqual([0, 0, 0, 0]);
    expect(result.text).toBe('ok');
  });

  it('does not invent a page number', async () => {
    captureFetch({ pages: [{ text_lines: [{ text: 'x', confidence: 1, bbox: [0, 0, 1, 1] }] }] });
    const result = await configured().ocr(Buffer.from('i'), 'p.png');
    // Position, not 0 -- which downstream would read as "unknown".
    expect(result.pages?.[0].page).toBe(1);
  });

  it('reports an HTTP failure rather than returning empty text', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: async () => 'upstream down',
    })) as any;
    await expect(configured().ocr(Buffer.from('i'), 'p.png')).rejects.toThrow(/502/);
  });
});
