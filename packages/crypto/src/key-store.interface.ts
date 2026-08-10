/**
 * Persistence for wrapped data keys.
 *
 * Abstracted so this package stays free of any particular Prisma client: the
 * gateway and case-service both encrypt personal data (they own the `identity`
 * and `claims` contexts respectively) and each supplies its own store backed by
 * the same `encryption_keys` table.
 */
export interface StoredDataKey {
  version: number;
  wrappedDataKey: string;
  algorithm: string;
}

export interface KeyStore {
  /** Newest key still used for new writes, or null on first run. */
  findActiveKey(): Promise<StoredDataKey | null>;

  /** Any key by version, including retired ones — old ciphertext must stay readable. */
  findKeyByVersion(version: number): Promise<StoredDataKey | null>;

  /**
   * Persist a new key. Must reject a duplicate version (unique constraint) so a
   * concurrent bootstrap resolves to one key rather than two.
   */
  createKey(key: StoredDataKey): Promise<StoredDataKey>;
}

export const KEY_STORE = Symbol('KEY_STORE');
