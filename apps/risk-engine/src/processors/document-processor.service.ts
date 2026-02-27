import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { GpuClientService } from '../llm/gpu-client.service';
import { TrinityCheckEngine } from '../trinity/trinity.engine';
import { DocumentStatus, DocumentType } from '@tci/shared-types';
import { ExtractionService } from './extraction/extraction.service';
import { getNormalizer } from './extraction/normalizers';
import sharp from 'sharp';
import * as fs from 'fs';
import * as path from 'path';

import { EventsGateway } from '../trinity/events.gateway';
import { StorageService } from '../common/services/storage.service';
import { TrinityReportGenerator } from '../trinity/trinity-report.generator';

const roundTo56 = (n: number) => Math.max(56, Math.round(n / 56) * 56);

@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);

  constructor(
    private prisma: PrismaService,
    private gpu: GpuClientService,
    private trinity: TrinityCheckEngine,
    private events: EventsGateway,
    private extractionService: ExtractionService,
    private storage: StorageService,
    private reportGenerator: TrinityReportGenerator
  ) {}

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

  async processDocumentFromUrl(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error('Document not found');

    if (!doc.storageUrl) throw new Error('Document has no storage URL');

    try {
      await this.updateDocumentStatus(documentId, DocumentStatus.PROCESSING, doc.claimId);
      this.events.emitTrinityUpdate(doc.claimId, 'PROCESSING');

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

  async processDocument(documentId: string, fileBuffer: Buffer, mimeType: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error('Document not found');

    const startTime = Date.now();
    let resultData: any = {};
    let rawText = '';
    let visionData: any = null;
    let modelUsed = '';

    try {
      const isImage = mimeType.startsWith('image/');
      const docType = doc.type as DocumentType;

      const normalizer = getNormalizer(docType);
      if (normalizer) {
        if (isImage) {
          modelUsed = 'qwen2.5vl:7b';
          const prompt = this.extractionService.getPrompt(docType);
          const optimizedBuffer = await this.preprocessImage(fileBuffer, docType, doc.filename);
          const resp = await this.gpu.visionJson(prompt, optimizedBuffer, doc.filename, modelUsed);
          visionData = resp.output || resp;
          resultData = this.extractionService.normalize(docType, visionData);
        } else {
          const ocrResp = await this.gpu.ocr(fileBuffer, doc.filename);
          rawText = ocrResp.text || '';

          modelUsed = 'qwen2.5:7b';
          const prompt = this.extractionService.getPrompt(docType, rawText);
          const llmResp = await this.gpu.generateJson(prompt, modelUsed);
          const rawResult = llmResp.output || llmResp;
          resultData = this.extractionService.normalize(docType, rawResult);
        }

        await this.prisma.documentAnalysis.upsert({
          where: { documentId: doc.id },
          create: {
            documentId: doc.id,
            tenantId: doc.tenantId,
            userId: doc.userId,
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
      }

      const unfinishedDocs = await this.prisma.document.count({
        where: {
          claimId: doc.claimId,
          id: { not: documentId },
          status: { in: [DocumentStatus.QUEUED, DocumentStatus.PROCESSING] as any },
        },
      });
      if (unfinishedDocs === 0) {
        this.runTrinityCheck(doc.claimId, doc.tenantId || undefined, doc.userId || undefined);
      }
    } catch (error) {
      this.logger.error(`Failed to process document ${documentId}: ${error}`);
      throw error;
    }
  }

  async runTrinityCheck(claimId: string, tenantId?: string, userId?: string) {
    const dataBag: any = { visualEvidence: [] };
    const claimDocs = await this.prisma.document.findMany({
      where: { claimId },
      include: { analysis: true },
    });

    for (const d of claimDocs) {
      if (!d.analysis?.extractedData && !d.analysis?.visionData) continue;
      const content = d.analysis.extractedData as any;
      const vision = d.analysis.visionData as any;

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
      include: {
        claimant: true,
        sessions: {
          include: {
            clientInfos: true,
          },
        },
      },
    });

    dataBag.claim = claim;
    const sessionClientInfos = claim?.sessions.flatMap(s => s.clientInfos) || [];
    dataBag.sessionClientInfo = sessionClientInfos;

    const report = this.trinity.auditClaim(dataBag);

    const trinityCheck = await this.prisma.trinityCheck.create({
      data: {
        claimId,
        tenantId: tenantId || claim?.insurerTenantId,
        userId: userId,
        score: report.total_score,
        status: 'PROCESSING',
        summary: report.summary,
        checkResults: report.checks as any,
        riskFactors: report.risk_factors as any,
      },
    });

    this.logger.log(`Trinity Check started for Claim ${claimId}`);
    await this.runIntelligenceReasoning(claimId, trinityCheck.id, dataBag, report);
  }

  private async preprocessImage(
    buffer: Buffer,
    type: DocumentType,
    filename: string
  ): Promise<Buffer> {
    try {
      let pipeline = sharp(buffer);
      const metadata = await pipeline.metadata();
      const originalWidth = metadata.width || 1024;
      const originalHeight = metadata.height || 1024;

      const MAX_PIXELS = 700000;
      const scale = Math.min(1.0, Math.sqrt(MAX_PIXELS / (originalWidth * originalHeight)));
      const targetWidth = roundTo56(originalWidth * scale);
      const targetHeight = roundTo56(originalHeight * scale);

      if (
        [
          DocumentType.NRIC,
          DocumentType.MYKAD_FRONT,
          DocumentType.DRIVING_LICENCE,
          DocumentType.VEHICLE_REG_CARD,
        ].includes(type)
      ) {
        pipeline = pipeline
          .grayscale()
          .normalise()
          .linear(1.2, -10)
          .modulate({ brightness: 1.1 })
          .sharpen();
      }

      return await pipeline
        .resize({ width: targetWidth, height: targetHeight, fit: 'fill' })
        .toBuffer();
    } catch (error: any) {
      return buffer;
    }
  }

  async runIntelligenceReasoning(
    claimId: string,
    trinityCheckId: string,
    dataBag: any,
    report: any
  ) {
    this.logger.log(`Starting intelligence reasoning for Claim ${claimId}`);
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

      6. **Session & Digital Breadcrumbs (True Claim Intelligence)**:
         - **Geolocation**: Compare the claimant's session location (GPS) against the reported Accident Location.
         - **Device Integrity**: Check for multiple sessions from different devices or suspicious networks (VPN/Proxy).
         - **IP/ISP Analysis**: Verify if the ISP/Organisation matches the expected region.

      DECLARED CLAIM DETAILS:
      ${JSON.stringify(dataBag.claim, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}

      EXTRACTED DOCUMENTS DATA (Evidence):
      ${JSON.stringify(dataBag, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}

      AUTOMATED CHECKS REPORT:
      ${JSON.stringify(report, (key, value) => (typeof value === 'bigint' ? value.toString() : value), 2)}

      OUTPUT INSTRUCTIONS:
      - Provide a comprehensive "reasoning" narrative that explicitly walks through these checks for claim's legitimacy:
        • Explicitly walk through every validation check performed on the claim.
        • Clearly explain what was reviewed (documents, timelines, amounts, policy terms, claimant behavior, supporting evidence, inconsistencies, etc.).
        • Describe both confirming and contradicting findings.
        • Explain why each finding strengthens or weakens the legitimacy of the claim.
        • Include risk indicators, fraud markers (if any), and contextual factors.
        • Demonstrate logical progression from evidence → analysis → conclusion.
        • Avoid vague statements — provide specific analytical commentary.
        • Be substantially detailed (multiple well-developed paragraphs).

      - Clearly list all detected "red_flags".
        • Each red flag should be specific and actionable.
        • If no red flags are present, explicitly state "None identified."

      - Clearly list practical "insights" for the adjuster.
        • Include investigative suggestions, documentation gaps, behavioral observations, and risk mitigation considerations.
        • Provide forward-looking guidance (what should be verified next, what to monitor, etc.).

      - Provide a final "recommendation" based strictly on the analytical findings:
        • APPROVE
        • INVESTIGATE
        • REJECT
        (The recommendation must logically align with the reasoning.)

      - Provide a "confidence" score between 0 and 1 reflecting the strength and completeness of the analysis.
      
      Response Format (JSON Only):
      {
        "reasoning": "Extensive, step-by-step, paragraph-style analytical narrative explaining validation checks, findings, contradictions, and logical conclusions.",
        "red_flags": ["Specific issue 1", "Specific issue 2"],
        "insights": ["Actionable insight 1", "Actionable insight 2"],
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
          status: (report as any).status || 'COMPLETED',
          reasoningInsights: {
            model,
            flags: result.red_flags,
            insights: result.insights,
            recommendation: result.recommendation,
            confidence: result.confidence,
          } as any,
        },
      });

      // Generate and Upload Report
      try {
        const finalTrinityCheck = await this.prisma.trinityCheck.findUnique({
          where: { id: trinityCheckId },
          include: {
            claim: {
              include: {
                claimant: true,
                tenant: true,
                documents: {
                  include: {
                    analysis: true,
                  },
                },
              },
            },
          },
        });

        if (finalTrinityCheck) {
          const reportBuffer = await this.reportGenerator.generate({
            claim: finalTrinityCheck.claim,
            claimant: finalTrinityCheck.claim.claimant,
            trinityCheck: finalTrinityCheck,
            documents: (finalTrinityCheck.claim as any).documents || [],
            tenant: finalTrinityCheck.claim.tenant,
          });

          const storagePath = await this.storage.uploadFile(
            reportBuffer,
            `trinity_report_${finalTrinityCheck.claim.claimNumber}.pdf`,
            'application/pdf'
          );

          const signedUrl = await this.storage.getSignedUrl(storagePath, 60 * 60 * 24 * 7);
          await this.prisma.trinityCheck.update({
            where: { id: trinityCheckId },
            data: { reportUrl: signedUrl },
          });

          this.logger.log(`Trinity Report generated and uploaded (Signed URL): ${signedUrl}`);
        }
      } catch (reportError) {
        this.logger.error(`Failed to generate/upload report: ${reportError}`);
      }

      this.events.emitTrinityUpdate(claimId, 'COMPLETED');
    } catch (error) {
      this.logger.error(`Intelligence reasoning failed for Claim ${claimId}: ${error}`);
    }
  }
}
