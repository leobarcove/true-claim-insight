import { Injectable, Logger } from '@nestjs/common';
import {
  SignatureFinalized,
  SignatureProvider,
  SignatureRequestCreated,
  SignatureRequestInput,
} from './signature-provider.interface';
import { randomUUID } from 'crypto';

/**
 * Stub signing provider. Generates plausible-looking request ids and
 * sign URLs without calling any external service. Lets the rest of the
 * platform exercise the full signing lifecycle locally.
 *
 * Swap with a SigningCloudProvider (or DocuSign, etc.) by rebinding the
 * SIGNATURE_PROVIDER token in SignaturesModule — same interface.
 */
@Injectable()
export class StubSignatureProvider implements SignatureProvider {
  private readonly logger = new Logger(StubSignatureProvider.name);

  readonly name = 'StubSigningCloud';

  async createRequest(
    input: SignatureRequestInput
  ): Promise<SignatureRequestCreated> {
    const externalRequestId = `stub-${randomUUID()}`;
    // Use the api-gateway base so the URL looks like a real signing
    // portal link. The actual page doesn't exist in this branch — the
    // demo flow calls /complete-signature directly instead.
    const signUrl = `${this.signingBase()}/sign/${externalRequestId}`;
    this.logger.log(
      `Stub signature request created: ${externalRequestId} for doc ${input.documentId} (${input.signerName})`
    );
    return {
      externalRequestId,
      signUrl,
      createdAt: new Date().toISOString(),
    };
  }

  async finalizeRequest(externalRequestId: string): Promise<SignatureFinalized> {
    // In a real provider the signed PDF URL would come from the vendor.
    // For the stub we keep using the original storage URL but tag the
    // pathname so the UI can distinguish a "signed" copy.
    const signedDocumentUrl = `${this.signingBase()}/signed/${externalRequestId}.pdf`;
    this.logger.log(`Stub signature finalized: ${externalRequestId}`);
    return {
      externalRequestId,
      signedAt: new Date().toISOString(),
      signedDocumentUrl,
    };
  }

  private signingBase(): string {
    return (
      process.env.SIGNING_PORTAL_PUBLIC_URL ?? 'https://signingcloud.example'
    );
  }
}
