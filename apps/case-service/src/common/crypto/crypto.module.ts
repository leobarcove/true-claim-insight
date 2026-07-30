import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../config/prisma.module';
import { EncryptionService } from './encryption.service';
import { EnvKeyProvider } from './env-key-provider';
import { KEY_PROVIDER } from './key-provider.interface';

/**
 * Field-level encryption. Global because any module holding personal data needs
 * it, and there should only ever be one data-key cache per process.
 *
 * Swapping master-key custody to AWS KMS means providing a KmsKeyProvider here
 * and re-wrapping the stored data key — no change to callers, no change to the
 * encrypted data itself.
 */
@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [{ provide: KEY_PROVIDER, useClass: EnvKeyProvider }, EncryptionService],
  exports: [EncryptionService, KEY_PROVIDER],
})
export class CryptoModule {}
