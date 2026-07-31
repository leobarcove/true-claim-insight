import { OFFSHORE_PROVIDERS, TransferRegister } from '@tci/prisma-client';

/**
 * COMPLIANCE TESTS — PDPA s.129 transfer register (CBPDT Guidelines, 2025).
 *
 * The Guidelines require a record of each cross-border transfer naming the
 * recipient, country, data type, purpose and basis. These tests hold the
 * registry honest: every offshore provider the platform integrates must be
 * declared here, with a country and a plain-language description.
 */
describe('Cross-border transfer register (s.129)', () => {
  it('declares every offshore provider the platform integrates', () => {
    // From the integration table in CLAUDE.md: Daily.co, Hume, Gemini and
    // Supabase all process claimant data outside Malaysia. If an integration is
    // added without a registry entry, its transfers cannot be recorded — update
    // this list and the registry together.
    expect(Object.keys(OFFSHORE_PROVIDERS).sort()).toEqual([
      'DAILY_CO',
      'GOOGLE_GEMINI',
      'HUME_AI',
      'SUPABASE',
    ]);
  });

  it('names a country and a readable data description for each', () => {
    for (const entry of Object.values(OFFSHORE_PROVIDERS)) {
      expect(entry.country.trim().length).toBeGreaterThan(3);
      expect(entry.what.trim().length).toBeGreaterThan(20);
    }
  });

  it('records what was sent, with the registry description as the default', async () => {
    const created: Record<string, unknown>[] = [];
    const register = new TransferRegister(
      { transferRecord: { create: async args => created.push(args.data) } },
      'test-service'
    );

    await register.record({ provider: 'HUME_AI', purpose: 'test', claimId: 'c1' });

    expect(created[0].provider).toBe('HUME_AI');
    expect(created[0].country).toBe('United States');
    expect(created[0].sourceService).toBe('test-service');
    expect(created[0].dataDescription).toBe(OFFSHORE_PROVIDERS.HUME_AI.what);
  });

  it('records a missing lawful basis as null rather than inventing one', async () => {
    // A register that papers over the gap is worse than the gap: the honest
    // record of "no basis established" is itself the evidence that drives the
    // fix, and a false basis would mislead exactly when it matters.
    const created: Record<string, unknown>[] = [];
    const register = new TransferRegister(
      { transferRecord: { create: async args => created.push(args.data) } },
      'test-service'
    );

    await register.record({ provider: 'GOOGLE_GEMINI', purpose: 'extraction' });

    expect(created[0].lawfulBasis).toBeNull();
  });

  it('is fail-soft, surfacing the failure instead of raising', async () => {
    const failures: unknown[] = [];
    const register = new TransferRegister(
      { transferRecord: { create: async () => { throw new Error('db down'); } } },
      'test-service',
      entry => failures.push(entry)
    );

    // A register outage must not take claim processing down with it — but an
    // unrecorded transfer is a breach, so the failure has to be surfaced.
    await expect(register.record({ provider: 'HUME_AI', purpose: 'x' })).resolves.toBeUndefined();
    expect(failures).toHaveLength(1);
  });
});
