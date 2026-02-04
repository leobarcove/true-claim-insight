import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service'; // Adjust path if needed
import { GpuClientService } from '../llm/gpu-client.service';
import { TrinityCheckEngine } from '../trinity/trinity.engine';
import { DocumentStatus, DocumentType } from '@tci/shared-types';
import { ExtractionService } from './extraction/extraction.service';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

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

      if (isImage) {
        // Vision Path
        modelUsed = 'qwen2.5vl:7b';
        const prompt = this.extractionService.getPrompt(docType);
        const optimizedBuffer = await this.preprocessImage(fileBuffer, docType, doc.filename);
        const resp = await this.gpu.visionJson(prompt, optimizedBuffer, doc.filename, modelUsed);
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
      visualEvidence: [],
    };
    const claimDocs = await this.prisma.document.findMany({
      where: { claimId },
      include: { analysis: true },
    });

    for (const d of claimDocs) {
      if (!d.analysis?.extractedData && !d.analysis?.visionData) continue;

      const content = d.analysis.extractedData as any;
      const vision = d.analysis.visionData as any;

      if (!content || !vision) continue;
      if (vision) dataBag.visualEvidence.push(vision);

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
          dataBag.damagePhoto = content;
          break;
      }
    }

    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { claimant: true },
    });

    dataBag.claim = claim;
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
   * Pre-processes images for VLM.
   * Resizes large images and enhances document-like images for better text readability.
   */
  private async preprocessImage(
    buffer: Buffer,
    type: DocumentType,
    filename: string
  ): Promise<Buffer> {
    try {
      const metadata = await sharp(buffer).metadata();
      const originalWidth = metadata.width || 1024;
      const originalHeight = metadata.height || 1024;
      const originalDpi = metadata.density || 72;

      // Dynamic DPI scaling to stay under pixel limit
      const MAX_PIXELS = 700000;
      const widthInch = originalWidth / originalDpi;
      const heightInch = originalHeight / originalDpi;

      // Calculate max DPI that keeps us under pixel limit
      const maxDpi = Math.sqrt(MAX_PIXELS / (widthInch * heightInch));
      const safeDpi = Math.min(150, maxDpi); // Cap at 150 DPI for quality
      this.logger.log(
        `Optimizing ${filename}: ${originalWidth}x${originalHeight} (${originalDpi} DPI) -> Goal: ${Math.round(safeDpi)} DPI`
      );

      let pipeline = sharp(buffer).resize({
        width: Math.round(widthInch * safeDpi),
        fit: 'inside',
        withoutEnlargement: true,
      });

      // Enhance for black-on-white text readability for documents
      if (type !== DocumentType.DAMAGE_PHOTO) {
        this.logger.log(`Applying document enhancement for ${type}`);
        pipeline = pipeline
          .grayscale()
          .normalise()
          .linear(1.2, -10)
          .modulate({ brightness: 1.1 })
          .sharpen();
      } else {
        this.logger.log(`Applying size optimization for photo ${type}`);
      }

      const optimizedBuffer = await pipeline
        .withMetadata({ density: Math.round(safeDpi) })
        .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      // TEMP: viewing
      // try {
      //   const tmpDir = path.join(process.cwd(), 'tmp');
      //   if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      //   const filePath = path.join(tmpDir, `opt_${filename}`);
      //   fs.writeFileSync(filePath, optimizedBuffer);
      //   this.logger.log(`Saved optimized image to: ${filePath}`);
      // } catch (err: any) {
      //   this.logger.warn(`Failed to save debug image: ${err.message}`);
      // }

      return optimizedBuffer;
    } catch (error: any) {
      this.logger.warn(`Image pre-processing failed: ${error.message}`);
      return buffer;
    }
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

    // Fetch Claim Details
    const claim = await this.prisma.claim.findUnique({
      where: { id: claimId },
      include: { claimant: true },
    });
    if (!claim) {
      this.logger.error(`Claim ${claimId} not found during reasoning`);
      return;
    }

    const prompt = `
      You are a senior insurance claim investigator (PIAM compliant) with expertise in fraud detection and motor claims.
      Your task is to perform a "Trinity Cross-Check" and fraud analysis on the provided claim documents and the DECLARED CLAIM DETAILS.
      
      You MUST analyze the following scenarios derived from our standard edge-case matrix:

      1. **Authenticity & fabrication**:
         - Verify "authenticity" flags for AI generation or screen captures across ALL docs.
         - Look for metadata tampering (e.g., Edit software "Photoshop") or stock photo patterns.

      2. **Person Identity**:
         - **Ghost Driver**: Does the Police Report Complainant match the Policy Holder/Insured Person?
         - **Unauthorized Driver**: Is the driver covered under the policy?
         - **Identity Theft**: Does the NRIC document match the Claim NRIC provided?
         - **NRIC Integrity**: Verify NRIC consistency (Date of Birth vs First 6 NRIC Digits) and check for Underage drivers.

      3. **Asset/Vehicle**:
         - **Klon Car**: Match Damage Photos (Make/Model/Color) against Vehicle Registration (VOC).
         - **Details**: Verify Plate and Chassis numbers across VOC, Policy, and Police Report.
         - **Legal**: Check VOC "road_tax_expiry" against Claim "incidentDate".
         - **Phantom Vehicle**: Does the Police Report describe the same vehicle being claimed for?

      4. **Incident Story**:
         - **Time Consistency**: Incident Date (Report) vs Policy Period vs Claim Date.
         - **Physics Check**: Does the collision description (e.g. "Rear-ended") match the visual damage areas (e.g. "front bumper")?
         - **Environmental Anomaly**: Match Report "weather" and "lighting" against Visual Evidence. (e.g. Night vs Day, Raining vs Sunny).
         - **Equipment**: Check Airbag deployment status vs Impact Severity.
         - **Document Integrity**: Ensure mandatory Police Report signatures are present.

      5. **Financial Padding**:
         - Compare Repair Quotation items against visible damage in Photos. Flag "Repair Inflation".
         - Check for "Unrelated Damage" (e.g., rust or old dents visible in photos but quoted as new).

      DECLARED CLAIM DETAILS:
      ${JSON.stringify(claim, null, 2)}

      EXTRACTED DOCUMENTS DATA (Evidence):
      ${JSON.stringify(dataBag, null, 2)}

      AUTOMATED CHECKS REPORT:
      ${JSON.stringify(report, null, 2)}

      OUTPUT INSTRUCTIONS:
      - Provide a "reasoning" narrative that explicitly walks through these checks for claim's legitimacy.
      - List "red_flags" for any failed checks.
      - List "insights" for the adjuster.
      
      Response Format (JSON Only):
      {
        "reasoning": "Detailed analysis discussing the findings",
        "red_flags": ["Flag 1", "Flag 2"],
        "insights": ["Insight 1", "Insight 2"],
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
