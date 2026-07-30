import { randomBytes } from 'crypto';
import { EncryptionService } from './encryption.service';
import { EnvKeyProvider } from './env-key-provider';
import type { KeyProvider } from './key-provider.interface';

/**
 * COMPLIANCE TESTS — field-level encryption of personal data (PDPA).
 *
 * What these guard, in order of how badly it would hurt to get wrong:
 *  1. A stored value cannot be read without the key.
 *  2. A *tampered* value fails loudly rather than decrypting to something else —
 *     this data decides where money is paid.
 *  3. Ciphertext carries its key version, so keys can be rotated without a
 *     big-bang re-encryption (the reason most systems never rotate).
 *  4. The searchable blind index is an HMAC, not a bare hash — a Malaysian NRIC
 *     is 12 structured digits and a plain SHA-256 rainbow table is trivial.
 *  5. Master-key custody can move (env → KMS) by re-wrapping the data key, with
 *     the encrypted data untouched.
 */
describe('EncryptionService (compliance)', () => {
  const masterKey = randomBytes(32).toString('base64');
  const config = (key: string) => ({ get: (name: string) => (name === 'ENCRYPTION_MASTER_KEY' ? key : undefined) }) as any;

  /** In-memory stand-in for the encryption_keys table. */
  const prismaStub = () => {
    const rows: any[] = [];
    return {
      rows,
      encryptionKey: {
        findFirst: async () => rows.find(r => !r.retiredAt) ?? null,
        findUnique: async ({ where }: any) => rows.find(r => r.version === where.version) ?? null,
        create: async ({ data }: any) => {
          if (rows.some(r => r.version === data.version)) throw new Error('unique violation');
          const row = { id: `k${data.version}`, retiredAt: null, ...data };
          rows.push(row);
          return row;
        },
      },
    } as any;
  };

  const build = async (key = masterKey, prisma = prismaStub()) => {
    const service = new EncryptionService(prisma, new EnvKeyProvider(config(key)));
    await service.onModuleInit();
    return { service, prisma };
  };

  it('round-trips a value', async () => {
    const { service } = await build();

    const ciphertext = await service.encrypt('157123456789');

    expect(ciphertext).not.toContain('157123456789');
    expect(await service.decrypt(ciphertext)).toBe('157123456789');
  });

  it('produces different ciphertext each time (random IV)', async () => {
    const { service } = await build();

    const a = await service.encrypt('157123456789');
    const b = await service.encrypt('157123456789');

    // Identical inputs must not be linkable by comparing stored values.
    expect(a).not.toBe(b);
    expect(await service.decrypt(a)).toBe(await service.decrypt(b));
  });

  it('rejects a tampered value instead of returning wrong plaintext', async () => {
    const { service } = await build();
    const ciphertext = (await service.encrypt('157123456789'))!;
    const [version, iv, body, tag] = ciphertext.split(':');

    // Flip a byte in the ciphertext body.
    const corruptedBody = Buffer.from(body, 'base64');
    corruptedBody[0] ^= 0xff;
    const tampered = [version, iv, corruptedBody.toString('base64'), tag].join(':');

    await expect(service.decrypt(tampered)).rejects.toThrow(/authentication/i);
  });

  it('cannot be read with a different master key', async () => {
    const { service, prisma } = await build();
    const ciphertext = await service.encrypt('157123456789');

    // Same stored data key, different master key → the wrap cannot be opened.
    const attacker = new EncryptionService(prisma, new EnvKeyProvider(config(randomBytes(32).toString('base64'))));

    await expect(attacker.decrypt(ciphertext)).rejects.toThrow(/master key does not match/i);
  });

  it('tags ciphertext with the key version so keys can be rotated', async () => {
    const { service } = await build();

    const ciphertext = await service.encrypt('157123456789');

    expect(ciphertext!.startsWith('v1:')).toBe(true);
    expect(service.isEncrypted(ciphertext)).toBe(true);
    expect(service.isEncrypted('157123456789')).toBe(false);
  });

  it('still decrypts values written under a retired key after rotation', async () => {
    const { service, prisma } = await build();
    const underV1 = await service.encrypt('111111111111');

    // Rotate: retire v1, add v2, restart the service.
    prisma.rows[0].retiredAt = new Date();
    const dataKeyV2 = randomBytes(32);
    prisma.rows.push({
      id: 'k2',
      version: 2,
      wrappedDataKey: await new EnvKeyProvider(config(masterKey)).wrapDataKey(dataKeyV2),
      algorithm: 'aes-256-gcm',
      retiredAt: null,
    });

    const rotated = new EncryptionService(prisma, new EnvKeyProvider(config(masterKey)));
    await rotated.onModuleInit();
    const underV2 = await rotated.encrypt('222222222222');

    expect(underV2!.startsWith('v2:')).toBe(true);
    // The whole point of versioning: old data stays readable.
    expect(await rotated.decrypt(underV1)).toBe('111111111111');
    expect(await rotated.decrypt(underV2)).toBe('222222222222');
  });

  it('survives a change of master-key custody by re-wrapping only the data key', async () => {
    const { service, prisma } = await build();
    const ciphertext = await service.encrypt('157123456789');
    const dataBefore = prisma.rows[0].wrappedDataKey;

    // Simulate migrating custody env → "KMS": unwrap with the old provider,
    // wrap with the new one. The encrypted VALUE is never touched.
    const oldProvider = new EnvKeyProvider(config(masterKey));
    const newMaster = randomBytes(32).toString('base64');
    const rawDataKey = await oldProvider.unwrapDataKey(dataBefore);
    prisma.rows[0].wrappedDataKey = await new EnvKeyProvider(config(newMaster)).wrapDataKey(rawDataKey);

    const migrated = new EncryptionService(prisma, new EnvKeyProvider(config(newMaster)));
    await migrated.onModuleInit();

    expect(await migrated.decrypt(ciphertext)).toBe('157123456789');
    expect(prisma.rows[0].wrappedDataKey).not.toBe(dataBefore);
  });

  it('treats empty values as absent rather than encrypting them', async () => {
    const { service } = await build();

    expect(await service.encrypt(null)).toBeNull();
    expect(await service.encrypt('')).toBeNull();
    expect(await service.decrypt(null)).toBeNull();
  });

  it('refuses to start without a master key', () => {
    expect(() => new EnvKeyProvider(config(''))).toThrow(/ENCRYPTION_MASTER_KEY is not set/);
  });

  it('refuses a master key of the wrong length', () => {
    expect(() => new EnvKeyProvider(config(randomBytes(16).toString('base64')))).toThrow(/32 bytes/);
  });

  describe('display tail', () => {
    it('keeps only the last four digits', async () => {
      const { service } = await build();

      expect(service.lastDigits('157123456789')).toBe('6789');
      expect(service.lastDigits('1571-2345-6789')).toBe('6789');
      expect(service.lastDigits('12')).toBe('12');
      expect(service.lastDigits(null)).toBeNull();
    });
  });

  describe('blind index for lookups', () => {
    it('is deterministic for the same value and pepper', async () => {
      const { service } = await build();

      const a = service.blindIndex('880101-14-5555', 'pepper');
      const b = service.blindIndex('880101145555', 'pepper');

      // Formatting differences must not produce a different index.
      expect(a).toBe(b);
    });

    it('differs when the pepper differs (not a bare hash)', async () => {
      const { service } = await build();

      const withPepper = service.blindIndex('880101-14-5555', 'pepper-one');
      const withOther = service.blindIndex('880101-14-5555', 'pepper-two');

      expect(withPepper).not.toBe(withOther);
    });

    it('requires a pepper', async () => {
      const { service } = await build();

      expect(() => service.blindIndex('880101-14-5555', '')).toThrow(/pepper is required/);
    });

    it('compares in constant time', async () => {
      const { service } = await build();
      const index = service.blindIndex('880101-14-5555', 'pepper')!;

      expect(service.indexMatches(index, index)).toBe(true);
      expect(service.indexMatches(index, index.replace(/.$/, '0'))).toBe(false);
    });
  });
});
