import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { KeyProvider } from './key-provider.interface';

/**
 * Master key held in the environment. Correct for local development and for a
 * first deployment; replace with a KMS-backed provider before real claimant
 * data is at stake (docs/MASTER_PLAN.md §3.4).
 *
 * Storage rules for the value itself (they matter more than this code):
 *  - never committed — .env is gitignored and only the empty placeholder in
 *    .env.example is tracked;
 *  - backed up in a password manager, because **losing the master key makes
 *    every encrypted value unrecoverable**;
 *  - a different key per environment, and the development key never promoted
 *    to production.
 */
@Injectable()
export class EnvKeyProvider implements KeyProvider {
  readonly name = 'env';
  private readonly logger = new Logger(EnvKeyProvider.name);
  private readonly masterKey: Buffer;

  constructor(configService: ConfigService) {
    const configured = configService.get<string>('ENCRYPTION_MASTER_KEY');

    if (!configured) {
      // Fail loudly at boot rather than silently writing plaintext later.
      throw new Error(
        'ENCRYPTION_MASTER_KEY is not set. Generate one with:\n' +
          "  node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"\n" +
          'then add it to .env (and store a copy in your password manager — losing it ' +
          'makes encrypted data unrecoverable).'
      );
    }

    const key = Buffer.from(configured, 'base64');
    if (key.length !== 32) {
      throw new Error(
        `ENCRYPTION_MASTER_KEY must be 32 bytes base64-encoded (got ${key.length}). ` +
          'AES-256 requires a 256-bit key.'
      );
    }

    this.masterKey = key;
    this.logger.log('Master key loaded from environment (KMS custody is the production step)');
  }

  async wrapDataKey(dataKey: Buffer): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
    const wrapped = Buffer.concat([cipher.update(dataKey), cipher.final()]);
    const tag = cipher.getAuthTag();

    return [
      'env',
      iv.toString('base64'),
      wrapped.toString('base64'),
      tag.toString('base64'),
    ].join(':');
  }

  async unwrapDataKey(wrapped: string): Promise<Buffer> {
    const [scheme, ivPart, keyPart, tagPart] = wrapped.split(':');

    if (scheme !== 'env') {
      throw new Error(
        `Wrapped key was produced by the "${scheme}" provider, not "env". ` +
          'Use the provider that wrapped it, or re-wrap the data key.'
      );
    }

    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.masterKey,
      Buffer.from(ivPart, 'base64')
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));

    try {
      return Buffer.concat([decipher.update(Buffer.from(keyPart, 'base64')), decipher.final()]);
    } catch {
      // GCM authentication failed: wrong master key, or the stored value was altered.
      throw new Error(
        'Failed to unwrap the data key — the master key does not match the one that wrapped it, ' +
          'or encryption_keys.wrappedDataKey has been modified.'
      );
    }
  }
}
