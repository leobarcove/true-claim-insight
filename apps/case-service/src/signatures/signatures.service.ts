import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Document, Prisma, SignatureStatus } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { TenantContext } from '../common/guards/tenant.guard';
import {
  SIGNATURE_PROVIDER,
  SignatureProvider,
} from './signature-provider.interface';

/**
 * Owns the digital signature lifecycle for Documents. Pairs with any
 * SignatureProvider implementation via the SIGNATURE_PROVIDER token —
 * StubSignatureProvider today, SigningCloud later, identical service.
 *
 * State machine:
 *   NOT_REQUESTED -> PENDING       (requestSignature)
 *   PENDING       -> SIGNED        (completeSignature, normally webhook-driven)
 *   PENDING       -> CANCELLED     (cancelSignature)
 *
 * Each transition writes an AuditTrail row. The Document row carries the
 * authoritative status the UI reads.
 */
@Injectable()
export class SignaturesService {
  private readonly logger = new Logger(SignaturesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SIGNATURE_PROVIDER)
    private readonly provider: SignatureProvider
  ) {}

  async requestSignature(
    documentId: string,
    tenantContext: TenantContext
  ): Promise<Document> {
    const doc = await this.loadDocument(documentId, tenantContext);
    if (doc.signatureStatus !== SignatureStatus.NOT_REQUESTED) {
      throw new BadRequestException(
        `Document is already in ${doc.signatureStatus} state — cannot create a new signing request.`
      );
    }

    const claim = await this.prisma.claim.findUnique({
      where: { id: doc.claimId },
      include: { claimant: true },
    });
    if (!claim?.claimant) {
      throw new BadRequestException(
        'Cannot request signature: claim has no claimant'
      );
    }

    const created = await this.provider.createRequest({
      documentId: doc.id,
      documentTitle: doc.filename,
      signerName: claim.claimant.fullName ?? 'Claimant',
      signerPhone: claim.claimant.phoneNumber ?? undefined,
      documentUrl: doc.storageUrl,
    });

    const updated = await this.prisma.document.update({
      where: { id: doc.id },
      data: {
        signatureStatus: SignatureStatus.PENDING,
        signatureRequestId: created.externalRequestId,
        signatureUrl: created.signUrl,
        signatureRequestedAt: new Date(),
      },
    });

    await this.audit(doc.id, 'SIGNATURE_REQUESTED', {
      provider: this.provider.name,
      externalRequestId: created.externalRequestId,
      claimantId: claim.claimantId,
    }, tenantContext);

    return updated;
  }

  /**
   * Mark the document as SIGNED. In production this is invoked from a
   * webhook handler when the vendor calls back; in stub/demo mode it's
   * exposed via HTTP so QA can advance the lifecycle.
   */
  async completeSignature(
    documentId: string,
    tenantContext: TenantContext
  ): Promise<Document> {
    const doc = await this.loadDocument(documentId, tenantContext);
    if (doc.signatureStatus !== SignatureStatus.PENDING) {
      throw new BadRequestException(
        `Document is in ${doc.signatureStatus} state — only PENDING documents can be completed.`
      );
    }
    if (!doc.signatureRequestId) {
      throw new BadRequestException(
        'Document is PENDING but has no signatureRequestId (data inconsistency).'
      );
    }

    const finalized = await this.provider.finalizeRequest(doc.signatureRequestId);

    const updated = await this.prisma.document.update({
      where: { id: doc.id },
      data: {
        signatureStatus: SignatureStatus.SIGNED,
        signedAt: new Date(finalized.signedAt),
        signedStorageUrl: finalized.signedDocumentUrl,
      },
    });

    await this.audit(doc.id, 'SIGNATURE_COMPLETED', {
      provider: this.provider.name,
      externalRequestId: doc.signatureRequestId,
      signedDocumentUrl: finalized.signedDocumentUrl,
    }, tenantContext);

    return updated;
  }

  async cancelSignature(
    documentId: string,
    tenantContext: TenantContext
  ): Promise<Document> {
    const doc = await this.loadDocument(documentId, tenantContext);
    if (doc.signatureStatus !== SignatureStatus.PENDING) {
      throw new BadRequestException(
        `Document is in ${doc.signatureStatus} state — only PENDING requests can be cancelled.`
      );
    }
    const updated = await this.prisma.document.update({
      where: { id: doc.id },
      data: { signatureStatus: SignatureStatus.CANCELLED },
    });
    await this.audit(doc.id, 'SIGNATURE_CANCELLED', {
      provider: this.provider.name,
      externalRequestId: doc.signatureRequestId,
    }, tenantContext);
    return updated;
  }

  private async loadDocument(
    documentId: string,
    tenantContext: TenantContext
  ): Promise<Document> {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (
      tenantContext.tenantId &&
      doc.tenantId &&
      doc.tenantId !== tenantContext.tenantId
    ) {
      // Defence-in-depth on top of the controller's TenantGuard.
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  private async audit(
    documentId: string,
    action: string,
    metadata: Record<string, unknown>,
    tenantContext: TenantContext
  ) {
    try {
      await this.prisma.auditTrail.create({
        data: {
          entityId: documentId,
          entityType: 'DOCUMENT',
          action,
          metadata: metadata as Prisma.InputJsonValue,
          tenantId: tenantContext.tenantId ?? null,
          userId:
            tenantContext.userRole === 'CLAIMANT' ? null : tenantContext.userId,
        },
      });
    } catch (e: any) {
      // Non-fatal — losing one audit row should not block the lifecycle.
      this.logger.warn(`Audit write failed for ${action} on ${documentId}: ${e.message}`);
    }
  }
}
