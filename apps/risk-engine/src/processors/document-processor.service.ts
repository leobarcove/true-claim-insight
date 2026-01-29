import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service'; // Adjust path if needed
import { GpuClientService } from '../llm/gpu-client.service';
import { TrinityCheckEngine } from '../trinity/trinity.engine';
import { DocumentStatus, DocumentType } from '@tci/shared-types';
import { ExtractionService } from './extraction/extraction.service';

import { EventsGateway } from '../trinity/events.gateway';

// Extraction schema and logic moved to ExtractionModule

@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);

  constructor(
    private prisma: PrismaService,
    private gpu: GpuClientService,
    private trinity: TrinityCheckEngine,
    private events: EventsGateway,
    private extractionService: ExtractionService
  ) {}

  /**
   * Helper to update document status and emit events
   */
  async updateDocumentStatus(documentId: string, status: any, claimId?: string) {
    this.logger.log(`Updating document ${documentId} status to: ${status}`);
    const updated = await this.prisma.document.update({
      where: { id: documentId },
      data: { status },
      select: { claimId: true },
    });

    const targetClaimId = claimId || updated.claimId;
    if (targetClaimId) {
      this.events.emitDocumentStatus(targetClaimId, documentId, status);
    }
  }

  /**
   * Orchestrates the analysis of a single document by ID (fetches content from Storage URL)
   */
  async processDocumentFromUrl(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error('Document not found');

    if (!doc.storageUrl) throw new Error('Document has no storage URL');

    try {
      // Update status to PROCESSING
      await this.updateDocumentStatus(documentId, DocumentStatus.PROCESSING, doc.claimId);

      // Download the file
      const response = await fetch(doc.storageUrl);
      if (!response.ok) throw new Error(`Failed to download document: ${response.statusText}`);

      const arrayBuffer = await response.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      const mimeType = doc.mimeType || 'application/octet-stream';
      const result = await this.processDocument(documentId, fileBuffer, mimeType);
      await this.updateDocumentStatus(documentId, DocumentStatus.COMPLETED, doc.claimId);

      return result;
    } catch (error) {
      this.logger.error(`Failed to download/process document ${documentId}: ${error}`);
      await this.updateDocumentStatus(documentId, DocumentStatus.FAILED, doc.claimId);
      throw error;
    }
  }

  /**
   * Core processing logic
   */
  async processDocument(documentId: string, fileBuffer: Buffer, mimeType: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error('Document not found');

    const startTime = Date.now();
    let resultData: any = {};
    let rawText = '';
    let visionData: any = null;
    let modelUsed = '';

    try {
      // 1. Determine Strategy based on Doc Type and MIME
      const isImage = mimeType.startsWith('image/');
      const docType = doc.type as DocumentType;

      if (
        isImage &&
        [
          DocumentType.NRIC,
          DocumentType.MYKAD_FRONT,
          DocumentType.DAMAGE_PHOTO,
          DocumentType.REPAIR_QUOTATION,
        ].includes(docType)
      ) {
        // Vision Path
        modelUsed = 'qwen2.5vl:7b';
        const prompt = this.extractionService.getPrompt(docType);
        const resp = await this.gpu.visionJson(prompt, fileBuffer, doc.filename, modelUsed);
        visionData = resp.output || resp;
        resultData = this.extractionService.normalize(docType, visionData);
      } else {
        // OCR
        const ocrResp = await this.gpu.ocr(fileBuffer, doc.filename);
        rawText = ocrResp.text || '';

        // Extraction
        modelUsed = 'qwen2.5:7b';
        const prompt = this.extractionService.getPrompt(docType, rawText);

        const llmResp = await this.gpu.generateJson(prompt, modelUsed);
        const rawResult = llmResp.output || llmResp;
        resultData = this.extractionService.normalize(docType, rawResult);
      }

      // 2. Save Analysis
      await this.prisma.documentAnalysis.upsert({
        where: { documentId: doc.id },
        create: {
          documentId: doc.id,
          rawText: rawText,
          extractedData: resultData,
          visionData: visionData,
          modelUsed: modelUsed,
          confidence: 0.9,
          processingTime: Date.now() - startTime,
        },
        update: {
          rawText: rawText,
          extractedData: resultData,
          visionData: visionData,
          modelUsed: modelUsed,
          updatedAt: new Date(),
        },
      });
      this.logger.log(`Processed document ${doc.filename} (${docType})`);

      // Only trigger Trinity Check if all documents for this claim have been processed
      const unfinishedDocs = await this.prisma.document.count({
        where: {
          claimId: doc.claimId,
          id: { not: documentId },
          status: { in: [DocumentStatus.QUEUED, DocumentStatus.PROCESSING] },
        },
      });
      if (unfinishedDocs === 0) {
        this.runTrinityCheck(doc.claimId);
      }
    } catch (error) {
      this.logger.error(`Failed to process document ${documentId}: ${error}`);
      throw error;
    }
  }

  /**
   * Runs the Cross-Check for a Claim
   */
  async runTrinityCheck(claimId: string) {
    const dataBag: any = {
      damagePhotos: [],
    };
    const claimDocs = await this.prisma.document.findMany({
      where: { claimId },
      include: { analysis: true },
    });

    for (const d of claimDocs) {
      if (!d.analysis?.extractedData && !d.analysis?.visionData) continue;

      const content = d.analysis.extractedData as any;
      const vision = d.analysis.visionData as any;

      switch (d.type) {
        case DocumentType.NRIC:
        case DocumentType.MYKAD_FRONT:
          dataBag.nric = content;
          break;
        case DocumentType.POLICY_DOCUMENT:
          dataBag.policy = content;
          break;
        case DocumentType.VEHICLE_REG_CARD:
          dataBag.registrationCard = content;
          break;
        case DocumentType.POLICE_REPORT:
          dataBag.policeReport = content;
          break;
        case DocumentType.REPAIR_QUOTATION:
          dataBag.repairQuotation = content;
          break;
        case DocumentType.DAMAGE_PHOTO:
          if (vision) dataBag.damagePhotos.push(vision);
          break;
      }
    }

    const report = this.trinity.auditClaim(dataBag);
    const trinityCheck = await this.prisma.trinityCheck.create({
      data: {
        claimId,
        score: report.total_score,
        status: report.status,
        summary: report.summary,
        checkResults: report.checks as any,
        riskFactors: report.risk_factors as any,
      },
    });

    this.logger.log(`Trinity Check completed for Claim ${claimId}: ${report.status}`);
    await this.runIntelligenceReasoning(claimId, trinityCheck.id, dataBag, report);
  }

  /**
   * Intelligence Reasoning using LLM reasoning (e.g. DeepSeek-R1)
   */
  async runIntelligenceReasoning(
    claimId: string,
    trinityCheckId: string,
    dataBag: any,
    report: any
  ) {
    this.logger.log(`Starting intelligence reasoning for Claim ${claimId}`);

    const prompt = `
      You are a senior insurance claim investigator with experience in motor, personal accident, and general insurance claims.
      Analyze the following extracted and consolidated data from multiple documents related to a single insurance claim.
      
      DOCUMENTS DATA:
      ${JSON.stringify(dataBag, null, 2)}
      
      TRINITY CROSS-CHECK RESULTS:
      ${JSON.stringify(report, null, 2)}
      
      Your task:
      Evaluate the overall legitimacy, consistency, and risk profile of the claim based strictly on the provided data.

      Please provide:
      1. A detailed reasoning of the claim's legitimacy.
      2. Any hidden red flags or inconsistencies not caught by automated checks.
      3. A final recommendation (APPROVE, INVESTIGATE, REJECT).
      4. Key insights for the adjuster.
      
      Format your response in a structured JSON:
      {
        "reasoning": "multi-line string discussing the findings",
        "insights": ["insight 1", "insight 2"],
        "recommendation": "APPROVE" | "INVESTIGATE" | "REJECT",
        "confidence": number (0-1)
      }
    `;

    try {
      const model = 'deepseek-r1:14b';
      const resp = await this.gpu.reasoningJson(prompt, model);
      const result = resp.output || resp;

      await this.prisma.trinityCheck.update({
        where: { id: trinityCheckId },
        data: {
          reasoning: result.reasoning,
          reasoningInsights: {
            model,
            insights: result.insights,
            recommendation: result.recommendation,
            confidence: result.confidence,
          },
        },
      });

      this.logger.log(`Intelligence reasoning completed for Claim ${claimId}`);

      // Emit Trinity Update
      this.events.emitTrinityUpdate(claimId, 'COMPLETED');
    } catch (error) {
      this.logger.error(`Intelligence reasoning failed for Claim ${claimId}: ${error}`);
    }
  }
}
