import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { StorageService } from '../common/services/storage.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { DocumentStatus } from '@tci/shared-types';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {}

  /**
   * Upload and create a document
   */
  async upload(claimId: string, file: any, type: string) {
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
    });

    // Trigger Risk Engine Analysis (Fire and forget)
    this.triggerRiskAnalysis(document.id).catch(err =>
      this.logger.error(`Failed to trigger risk analysis for ${document.id}`, err)
    );

    return document;
  }

  private async triggerRiskAnalysis(documentId: string) {
    const riskEngineUrl = this.configService.get('RISK_ENGINE_URL') || 'http://localhost:3004';
    const url = `${riskEngineUrl}/api/v1/risk/analyze/${documentId}`;
    this.logger.log(`Triggering analysis at ${url}`);

    await firstValueFrom(this.httpService.post(url, {}));
  }

  /**
   * Manually trigger analysis/trinity check for all docs in a claim
   */
  async triggerTrinityCheck(claimId: string) {
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
          await this.triggerRiskAnalysis(doc.id);
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
  async create(claimId: string, createDocumentDto: CreateDocumentDto) {
    // Verify claim exists
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

    const document = await this.prisma.document.create({
      data: {
        claimId,
        type: createDocumentDto.type as any,
        filename: createDocumentDto.filename,
        storageUrl: createDocumentDto.storageUrl,
        mimeType: createDocumentDto.mimeType,
        fileSize: createDocumentDto.fileSize,
        metadata: createDocumentDto.metadata || {},
      },
    });

    // Create audit trail
    await this.prisma.auditTrail.create({
      data: {
        entityId: claimId,
        entityType: 'CLAIM',
        action: 'DOCUMENT_UPLOADED',
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
  async findAll(claimId: string) {
    // Verify claim exists
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${claimId} not found`);
    }

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
  async findOne(claimId: string, id: string) {
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
  async getDownloadUrl(claimId: string, id: string) {
    const document = await this.findOne(claimId, id);
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
  async remove(claimId: string, id: string) {
    const document = await this.findOne(claimId, id);

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
        metadata: {
          documentId: document.id,
          filename: document.filename,
        },
      },
    });
  }
}
