import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { resolveLlmProvider } from './llm.module';
import { LlmProvider } from './llm-provider.interface';

/**
 * WHICH BACKEND SERVES A CLAIM IS A DATA-RESIDENCY DECISION, so it is tested.
 *
 * It used to be "GEMINI_API_KEY present → Gemini", which meant a key left in a
 * .env file was enough to send claimant documents to Google without anyone
 * choosing to. No cross-border basis is established (MASTER_PLAN §3.4), and
 * the platform runs on local models for now.
 */
const local = { name: 'OllamaGpu', offshore: false } as LlmProvider;
const offshore = { name: 'Gemini', offshore: true } as LlmProvider;

const silent = () =>
  ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }) as unknown as Logger;

const choose = (env: Record<string, string> = {}, logger: Logger = silent()) =>
  resolveLlmProvider(new ConfigService(env), local, offshore, logger);

describe('choosing an LLM backend', () => {
  it('runs locally when nothing is configured', () => {
    expect(choose()).toBe(local);
  });

  it('does NOT go offshore just because an API key is lying around', () => {
    // The regression this whole test file exists for. A key in .env is not a
    // decision to export personal data.
    expect(choose({ GEMINI_API_KEY: 'AIza-not-a-real-key' })).toBe(local);
  });

  it('goes offshore only when asked explicitly', () => {
    expect(choose({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' })).toBe(offshore);
  });

  it('accepts the local provider being named explicitly', () => {
    expect(choose({ LLM_PROVIDER: 'ollama' })).toBe(local);
  });

  it('is not defeated by casing or stray whitespace', () => {
    // Config arrives from .env files and shell exports; ' Gemini ' is a choice.
    expect(choose({ LLM_PROVIDER: '  GEMINI  ' })).toBe(offshore);
  });

  it('falls back to local on an unrecognised value rather than throwing', () => {
    // A typo must not take risk-engine down at boot -- the constructor-throw
    // regression this service already suffered. The safe direction for a config
    // error is the one where nothing leaves the machine.
    const logger = silent();
    expect(choose({ LLM_PROVIDER: 'openai' }, logger)).toBe(local);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('not recognised'));
  });

  it('says out loud when a run will cross a border', () => {
    // Nobody should discover this from a network trace.
    const logger = silent();
    choose({ LLM_PROVIDER: 'gemini' }, logger);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('outside Malaysia'));
  });
});
