import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { StorageService } from '../common/services/storage.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { DocumentStatus } from '@tci/shared-types';
import { TenantService } from '../tenant/tenant.service';
import { TenantContext } from '../common/guards/tenant.guard';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly tenantService: TenantService
  ) {}

  /**
   * Upload and create a document
   */
  async upload(claimId: string, file: any, type: string, tenantContext: TenantContext) {
    await this.tenantService.validateClaimAccess(claimId, tenantContext);

    const buffer = await file.toBuffer();
    const storagePath = await this.storageService.uploadFile(
      buffer,
      file.filename,
      file.mimetype,
      `claims/${claimId}`
    );

    const signedUrl = await this.storageService.getSignedUrl(storagePath, 60 * 60 * 24 * 7);

    // Create document record
    const document = await this.create(claimId, {
      type: type as any,
      status: DocumentStatus.QUEUED,
      filename: file.filename,
      storageUrl: signedUrl,
      mimeType: file.mimetype,
      fileSize: buffer.length,
      metadata: { storagePath },
    }, tenantContext);

    // Trigger Risk Engine Analysis (Fire and forget)
    this.triggerRiskAnalysis(document.id, tenantContext).catch(err =>
      this.logger.error(`Failed to trigger risk analysis for ${document.id}`, err)
    );

    return document;
  }

  /**
   * Replace an existing document with a new file
   */
  async replace(claimId: string, id: string, file: any, tenantContext: TenantContext) {
    const existingDoc = await this.findOne(claimId, id, tenantContext);
    const buffer = await file.toBuffer();
    const storagePath = await this.storageService.uploadFile(
      buffer,
      file.filename,
      file.mimetype,
      `claims/${claimId}`
    );

    const signedUrl = await this.storageService.getSignedUrl(storagePath, 60 * 60 * 24 * 7);
    const updatedDoc = await this.prisma.document.update({
      where: { id },
      data: {
        filename: file.filename,
        storageUrl: signedUrl,
        mimeType: file.mimetype,
        fileSize: buffer.length,
        status: DocumentStatus.QUEUED,
        metadata: {
          ...(existingDoc.metadata as any),
          storagePath,
          replacedAt: new Date(),
          previousDoc: {
            filename: existingDoc.filename,
            storageUrl: existingDoc.storageUrl,
            mimeType: existingDoc.mimeType,
            fileSize: existingDoc.fileSize,
          },
        },
      },
    });

    // Create audit trail
    await this.prisma.auditTrail.create({
      data: {
        entityId: claimId,
        entityType: 'CLAIM',
        action: 'DOCUMENT_REPLACED',
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId,
        actorId: tenantContext.userId,
        actorType: (tenantContext.userRole as any) || 'ADJUSTER',
        metadata: {
          documentId: id,
          oldFilename: existingDoc.filename,
          newFilename: file.filename,
        },
      },
    });

    // Trigger Risk Engine Analysis
    this.triggerRiskAnalysis(updatedDoc.id, tenantContext).catch(err =>
      this.logger.error(`Failed to trigger risk analysis for ${updatedDoc.id}`, err)
    );

    return updatedDoc;
  }

  private async triggerRiskAnalysis(documentId: string, tenantContext: TenantContext) {
    const riskEngineUrl = this.configService.get('RISK_ENGINE_URL') || 'http://localhost:3004';
    const url = `${riskEngineUrl}/api/v1/risk/analyze/${documentId}`;
    this.logger.log(`Triggering analysis at ${url}`);

    await firstValueFrom(
      this.httpService.post(url, {}, {
        headers: {
          'x-tenant-id': tenantContext.tenantId,
          'x-user-id': tenantContext.userId,
          'x-user-role': tenantContext.userRole,
        },
      })
    );
  }

  /**
   * Manually trigger analysis/trinity check for all docs in a claim
   */
  async triggerTrinityCheck(claimId: string, tenantContext: TenantContext) {
    await this.tenantService.validateClaimAccess(claimId, tenantContext);

    const docs = await this.prisma.document.findMany({
      where: { claimId },
    });

    if (docs.length === 0) {
      throw new NotFoundException('No documents found for this claim');
    }

    // Trigger analysis for each document
    const results = await Promise.all(
      docs.map(async doc => {
        try {
          await this.triggerRiskAnalysis(doc.id, tenantContext);
          return { id: doc.id, status: 'triggered' };
        } catch (err) {
          this.logger.error(`Manual trigger failed for doc ${doc.id}: ${err}`);
          return { id: doc.id, status: 'failed', error: (err as any).message };
        }
      })
    );

    return {
      claimId,
      totalProcessed: docs.length,
      results,
    };
  }

  /**
   * Add a document to a claim
   */
  async create(claimId: string, createDocumentDto: CreateDocumentDto, tenantContext: TenantContext) {
    // Verify claim exists and tenant has access
    await this.tenantService.validateClaimAccess(claimId, tenantContext);

    const document = await this.prisma.document.create({
      data: {
        claimId,
        type: createDocumentDto.type as any,
        filename: createDocumentDto.filename,
        storageUrl: createDocumentDto.storageUrl,
        mimeType: createDocumentDto.mimeType,
        fileSize: createDocumentDto.fileSize,
        metadata: createDocumentDto.metadata || {},
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId,
      },
    });

    // Create audit trail
    await this.prisma.auditTrail.create({
      data: {
        entityId: claimId,
        entityType: 'CLAIM',
        action: 'DOCUMENT_UPLOADED',
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId,
        actorId: tenantContext.userId,
        actorType: (tenantContext.userRole as any) || 'ADJUSTER',
        metadata: {
          documentId: document.id,
          filename: document.filename,
          type: document.type,
        },
      },
    });

    return document;
  }

  /**
   * Get all documents for a claim
   */
  async findAll(claimId: string, tenantContext: TenantContext) {
    // Verify claim exists and tenant has access
    await this.tenantService.validateClaimAccess(claimId, tenantContext);

    const documents = await this.prisma.document.findMany({
      where: { claimId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      claimId,
      totalDocuments: documents.length,
      documents,
    };
  }

  /**
   * Get a document by ID
   */
  async findOne(claimId: string, id: string, tenantContext: TenantContext) {
    await this.tenantService.validateClaimAccess(claimId, tenantContext);

    const document = await this.prisma.document.findFirst({
      where: { id, claimId },
    });

    if (!document) {
      throw new NotFoundException(`Document with ID ${id} not found`);
    }

    return document;
  }

  /**
   * Get presigned download URL
   */
  async getDownloadUrl(claimId: string, id: string, tenantContext: TenantContext) {
    const document = await this.findOne(claimId, id, tenantContext);
    const storagePath = (document.metadata as any)?.storagePath;
    let downloadUrl = document.storageUrl;

    if (storagePath) {
      try {
        downloadUrl = await this.storageService.getSignedUrl(storagePath);
      } catch (error: any) {
        this.logger.error(`Failed to refresh signed URL: ${error.message}`);
      }
    }

    const expiresIn = 3600; // 1 hour

    return {
      documentId: document.id,
      filename: document.filename,
      downloadUrl,
      expiresIn,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  /**
   * Delete a document
   */
  async remove(claimId: string, id: string, tenantContext: TenantContext) {
    const document = await this.findOne(claimId, id, tenantContext);

    // Delete from database (soft delete in production)
    await this.prisma.document.delete({
      where: { id },
    });

    // Create audit trail
    await this.prisma.auditTrail.create({
      data: {
        entityId: claimId,
        entityType: 'CLAIM',
        action: 'DOCUMENT_DELETED',
        tenantId: tenantContext.tenantId,
        actorId: tenantContext.userId,
        actorType: (tenantContext.userRole as any) || 'ADJUSTER',
        metadata: {
          documentId: document.id,
          filename: document.filename,
        },
      },
    });
  }
}
