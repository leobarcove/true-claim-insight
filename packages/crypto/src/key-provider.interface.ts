/**
 * Custody of the master key (KEK).
 *
 * Field values are encrypted with a data key (DEK). The DEK is never stored in
 * the clear — it is wrapped by the master key, and only the wrapped form goes
 * in the database (`encryption_keys.wrappedDataKey`).
 *
 * The point of this interface: the master key's *custody* changes over the
 * life of the business, while the encrypted data never has to.
 *
 *   today       EnvKeyProvider    master key from the environment
 *   on deploy   KmsKeyProvider    master key lives in AWS KMS (ap-southeast-5)
 *                                 and never exists in readable form outside it
 *
 * Migrating custody = unwrap the DEK with the old provider, wrap it with the
 * new one, update that single row. **No claim data is touched**, so it takes
 * the same few seconds whether there are five records or five million.
 */
export interface KeyProvider {
  /** Short identifier recorded against wrapped keys, e.g. 'env' or 'kms'. */
  readonly name: string;

  /** Encrypt a raw data key for storage. */
  wrapDataKey(dataKey: Buffer): Promise<string>;

  /** Recover a raw data key previously produced by wrapDataKey. */
  unwrapDataKey(wrapped: string): Promise<Buffer>;
}

export const KEY_PROVIDER = Symbol('KEY_PROVIDER');
