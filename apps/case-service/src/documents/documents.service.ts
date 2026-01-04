import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { StorageService } from '../common/services/storage.service';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService
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

    const signedUrl = await this.storageService.getSignedUrl(storagePath);
    return this.create(claimId, {
      type: type as any,
      filename: file.filename,
      storageUrl: signedUrl,
      mimeType: file.mimetype,
      fileSize: buffer.length,
      metadata: { storagePath },
    });
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

    // TODO: Delete from S3 in production
  }
}
