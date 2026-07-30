import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual, createHmac } from 'crypto';
import { PrismaService } from '../../config/prisma.service';
import { KEY_PROVIDER, KeyProvider } from './key-provider.interface';

/**
 * Field-level encryption for personal data (PDPA), using envelope encryption.
 *
 * Ciphertext format:  v<version>:<iv>:<ciphertext>:<authTag>   (base64 parts)
 *
 * The leading version is what makes key rotation practical: a new data key can
 * start encrypting new writes immediately while old values stay readable, so
 * rotation never requires a big-bang re-encryption. Without it, rotating means
 * rewriting every row at once — the reason most systems never rotate at all.
 *
 * AES-256-GCM is authenticated: a tampered value fails to decrypt rather than
 * returning wrong plaintext. That distinction matters when the value decides a
 * payout destination.
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';

  /** version → raw data key, cached after first unwrap. */
  private readonly dataKeys = new Map<number, Buffer>();
  private currentVersion?: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(KEY_PROVIDER) private readonly keyProvider: KeyProvider
  ) {}

  async onModuleInit() {
    await this.loadCurrentKey();
  }

  /**
   * Load the newest active data key, generating one on first run.
   *
   * The unique constraint on `version` makes a concurrent bootstrap safe: the
   * loser of the race re-reads the winner's row instead of creating a second key.
   */
  private async loadCurrentKey(): Promise<number> {
    const existing = await this.prisma.encryptionKey.findFirst({
      where: { retiredAt: null },
      orderBy: { version: 'desc' },
    });

    if (existing) {
      this.dataKeys.set(existing.version, await this.keyProvider.unwrapDataKey(existing.wrappedDataKey));
      this.currentVersion = existing.version;
      this.logger.log(`Data key v${existing.version} active (custody: ${this.keyProvider.name})`);
      return existing.version;
    }

    const dataKey = randomBytes(32);
    const wrappedDataKey = await this.keyProvider.wrapDataKey(dataKey);

    try {
      const created = await this.prisma.encryptionKey.create({
        data: { version: 1, wrappedDataKey, algorithm: this.algorithm },
      });
      this.dataKeys.set(created.version, dataKey);
      this.currentVersion = created.version;
      this.logger.log('Generated data key v1');
      return created.version;
    } catch {
      // Another instance won the race — adopt its key.
      return this.loadCurrentKey();
    }
  }

  private async dataKeyFor(version: number): Promise<Buffer> {
    const cached = this.dataKeys.get(version);
    if (cached) return cached;

    const row = await this.prisma.encryptionKey.findUnique({ where: { version } });
    if (!row) {
      throw new Error(
        `No data key with version ${version}. A value was encrypted with a key that is no longer ` +
          'in encryption_keys — restore it before this data can be read.'
      );
    }

    const key = await this.keyProvider.unwrapDataKey(row.wrappedDataKey);
    this.dataKeys.set(version, key);
    return key;
  }

  /** Encrypt a value. Returns null for null/empty input so optional fields stay optional. */
  async encrypt(plaintext: string | null | undefined): Promise<string | null> {
    if (plaintext === null || plaintext === undefined || plaintext === '') return null;

    const version = this.currentVersion ?? (await this.loadCurrentKey());
    const key = await this.dataKeyFor(version);
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [
      `v${version}`,
      iv.toString('base64'),
      ciphertext.toString('base64'),
      cipher.getAuthTag().toString('base64'),
    ].join(':');
  }

  /** Decrypt a value produced by encrypt(). Throws if it was tampered with. */
  async decrypt(payload: string | null | undefined): Promise<string | null> {
    if (!payload) return null;

    const parts = payload.split(':');
    if (parts.length !== 4 || !parts[0].startsWith('v')) {
      throw new Error(
        'Value is not in the expected ciphertext format (v<version>:<iv>:<ciphertext>:<tag>). ' +
          'It may be legacy plaintext that has not been migrated.'
      );
    }

    const [versionPart, ivPart, ciphertextPart, tagPart] = parts;
    const version = Number(versionPart.slice(1));
    if (!Number.isInteger(version)) throw new Error(`Malformed key version "${versionPart}"`);

    const decipher = createDecipheriv(
      this.algorithm,
      await this.dataKeyFor(version),
      Buffer.from(ivPart, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

    try {
      return Buffer.concat([
        decipher.update(Buffer.from(ciphertextPart, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      throw new Error(
        'Decryption failed authentication — the stored value has been altered, or it was ' +
          'encrypted with a different key.'
      );
    }
  }

  /** True when a value looks like our ciphertext rather than plaintext. */
  isEncrypted(value: string | null | undefined): boolean {
    if (!value) return false;
    const parts = value.split(':');
    return parts.length === 4 && /^v\d+$/.test(parts[0]);
  }

  /**
   * Last n characters, kept in the clear alongside the ciphertext so operator
   * screens can identify an account without decrypting it.
   */
  lastDigits(value: string | null | undefined, count = 4): string | null {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    return digits.length <= count ? digits : digits.slice(-count);
  }

  /**
   * Deterministic blind index for exact-match lookups on encrypted values.
   *
   * HMAC, not a plain hash: Malaysian NRICs are 12 structured digits, so a bare
   * SHA-256 of every possible NRIC is brute-forceable in seconds. The pepper is
   * what makes the index unguessable.
   *
   * Note the pepper is effectively permanent — changing it invalidates every
   * stored index, so lookups break until all values are re-indexed. Treat it as
   * write-once, unlike the encryption key which is designed to rotate.
   */
  blindIndex(value: string | null | undefined, pepper: string): string | null {
    if (!value) return null;
    if (!pepper) throw new Error('A pepper is required for a blind index');

    const normalised = value.replace(/\D/g, '');
    return createHmac('sha256', pepper).update(normalised).digest('hex');
  }

  /** Constant-time comparison, for verifying a blind index without leaking timing. */
  indexMatches(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  }
}
