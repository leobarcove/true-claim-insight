import type { PrismaClient } from '@prisma/client';

/**
 * A wrapped (encrypted) data key as persisted in `encryption_keys`.
 *
 * Structurally identical to `StoredDataKey` in @tci/crypto. It is restated here
 * rather than imported so that this package does not depend on @tci/crypto —
 * the dependency runs the other way at the type level only, in each consumer.
 */
export interface WrappedDataKey {
  version: number;
  wrappedDataKey: string;
  algorithm: string;
}

const SELECT = { version: true, wrappedDataKey: true, algorithm: true } as const;

/**
 * Prisma-backed persistence for envelope-encryption data keys.
 *
 * Every service that encrypts shares this one implementation because the
 * queries encode a semantic contract — "the active key is the highest-versioned
 * key that has not been retired". Two services disagreeing on that would write
 * ciphertext under one version while reading under another, which surfaces as
 * undecryptable data rather than a clean failure.
 *
 * Deliberately free of NestJS decorators so the seed and any future script can
 * use it; consumers wrap it in their own DI provider.
 */
export class PrismaKeyStore {
  constructor(private readonly prisma: Pick<PrismaClient, 'encryptionKey'>) {}

  async findActiveKey(): Promise<WrappedDataKey | null> {
    return this.prisma.encryptionKey.findFirst({
      where: { retiredAt: null },
      orderBy: { version: 'desc' },
      select: SELECT,
    });
  }

  async findKeyByVersion(version: number): Promise<WrappedDataKey | null> {
    return this.prisma.encryptionKey.findUnique({ where: { version }, select: SELECT });
  }

  async createKey(key: WrappedDataKey): Promise<WrappedDataKey> {
    return this.prisma.encryptionKey.create({ data: key, select: SELECT });
  }
}
