/**
 * Abstraction over the e-signature vendor. Designed so a real
 * SigningCloud (or DocuSign, etc.) client can swap in for the stub by
 * rebinding the provider token in the module — no service or controller
 * changes needed.
 *
 * The interface mirrors what real vendors expose:
 *  - createRequest: returns a vendor-side request id + a URL the signer
 *    opens in a browser
 *  - finalizeRequest: simulates / handles signing completion. In a real
 *    integration this would be triggered by a webhook from the vendor;
 *    in dev/demo mode we expose it as an HTTP endpoint so QA can
 *    advance the lifecycle without standing up the vendor.
 */
export interface SignatureRequestInput {
  documentId: string;
  documentTitle: string;
  signerName: string;
  signerPhone?: string;
  signerEmail?: string;
  /** URL of the unsigned PDF the vendor will retrieve. */
  documentUrl: string;
}

export interface SignatureRequestCreated {
  /** Vendor-side identifier for the request / envelope. */
  externalRequestId: string;
  /** URL the signer (claimant) opens in their browser to sign. */
  signUrl: string;
  /** ISO timestamp of when the request was created (vendor side). */
  createdAt: string;
}

export interface SignatureFinalized {
  externalRequestId: string;
  signedAt: string;
  /** URL of the countersigned PDF (signed copy stored separately). */
  signedDocumentUrl: string;
}

export interface SignatureProvider {
  readonly name: string;
  createRequest(input: SignatureRequestInput): Promise<SignatureRequestCreated>;
  /**
   * In stub/demo mode this advances the request to SIGNED immediately
   * and returns a signed-document URL. In a real integration this would
   * not exist on the provider — it would be called from a webhook
   * handler when the vendor notifies us.
   */
  finalizeRequest(externalRequestId: string): Promise<SignatureFinalized>;
}

export const SIGNATURE_PROVIDER = Symbol('SIGNATURE_PROVIDER');
