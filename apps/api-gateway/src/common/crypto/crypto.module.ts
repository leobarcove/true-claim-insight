import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionService, EnvKeyProvider, KEY_PROVIDER, KEY_STORE } from '@tci/crypto';
import { PrismaModule } from '../../config/prisma.module';
import { PrismaKeyStore } from './prisma-key-store';

/**
 * Field-level encryption of personal data.
 *
 * Registered in the two services that OWN personal data — the gateway
 * (`identity` context: Claimant) and case-service (`claims` context: Claim,
 * Policy). video-service and risk-engine deliberately hold no key: they obtain
 * the identity fields they need for document generation from an audited
 * case-service endpoint, so the master key never spreads to services that only
 * display data.
 *
 * Swapping custody to AWS KMS = provide a KmsKeyProvider here and re-wrap the
 * stored data key. No caller changes, no data re-encryption.
 */
@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [
    PrismaKeyStore,
    { provide: KEY_STORE, useExisting: PrismaKeyStore },
    { provide: KEY_PROVIDER, useClass: EnvKeyProvider },
    EncryptionService,
  ],
  exports: [EncryptionService],
})
export class CryptoModule {}
