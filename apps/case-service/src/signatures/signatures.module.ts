import { Module } from '@nestjs/common';
import { TenantModule } from '../tenant/tenant.module';
import { SignaturesController } from './signatures.controller';
import { SignaturesService } from './signatures.service';
import { StubSignatureProvider } from './stub-signature.provider';
import { SIGNATURE_PROVIDER } from './signature-provider.interface';

/**
 * Signing lifecycle module. The SIGNATURE_PROVIDER token currently
 * binds to the stub; swap useClass to SigningCloudProvider when an
 * API key is wired through env config. Service + controller stay
 * untouched because they depend on the interface.
 */
@Module({
  imports: [TenantModule],
  controllers: [SignaturesController],
  providers: [
    SignaturesService,
    { provide: SIGNATURE_PROVIDER, useClass: StubSignatureProvider },
  ],
  exports: [SignaturesService],
})
export class SignaturesModule {}
