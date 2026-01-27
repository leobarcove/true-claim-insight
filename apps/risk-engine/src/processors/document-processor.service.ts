import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service'; // Adjust path if needed
import { GpuClientService } from '../llm/gpu-client.service';
import { TrinityCheckEngine } from '../trinity/trinity.engine';
import { DocumentType } from '@tci/shared-types';

@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);

  constructor(
    private prisma: PrismaService,
    private gpu: GpuClientService,
    private trinity: TrinityCheckEngine
  ) {}

  /**
   * Orchestrates the analysis of a single document by ID (fetches content from Storage URL)
   */
  async processDocumentFromUrl(documentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error('Document not found');

    if (!doc.storageUrl) throw new Error('Document has no storage URL');

    try {
      // Download the file
      const response = await fetch(doc.storageUrl);
      if (!response.ok) throw new Error(`Failed to download document: ${response.statusText}`);

      const arrayBuffer = await response.arrayBuffer();
      const fileBuffer = Buffer.from(arrayBuffer);

      const mimeType = doc.mimeType || 'application/octet-stream';

      return this.processDocument(documentId, fileBuffer, mimeType);
    } catch (error) {
      this.logger.error(`Failed to download/process document ${documentId}: ${error}`);
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

      if (isImage && doc.type === 'DAMAGE_PHOTO') {
        // Vision Path
        modelUsed = 'qwen2.5vl:7b';
        const prompt = this.getExtractionPrompt(doc.type as DocumentType);
        const resp = await this.gpu.visionJson(prompt, fileBuffer, doc.filename, modelUsed);
        visionData = resp.output || resp;
        resultData = visionData;
      } else {
        // OCR + Text Extraction Path

        // A. OCR
        const ocrResp = await this.gpu.ocr(fileBuffer, doc.filename);
        rawText = ocrResp.text || '';

        // B. Extraction
        modelUsed = 'qwen2.5:7b';
        const prompt = this.getExtractionPrompt(doc.type as DocumentType, rawText);

        const llmResp = await this.gpu.generateJson(prompt, modelUsed);
        resultData = llmResp.output || llmResp;
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

      this.logger.log(`Processed document ${doc.filename} (${doc.type})`);

      // 3. Trigger Trinity Check for the whole claim
      await this.runTrinityCheck(doc.claimId);
    } catch (error) {
      this.logger.error(`Failed to process document ${documentId}: ${error}`);
      throw error;
    }
  }

  /**
   * Runs the Cross-Check for a Claim
   */
  async runTrinityCheck(claimId: string) {
    // 1. Fetch all analyzed docs for the claim
    const claimDocs = await this.prisma.document.findMany({
      where: { claimId },
      include: { analysis: true },
    });

    const dataBag: any = {
      damagePhotos: [],
    };

    // 2. Hydrate Data Bag
    for (const d of claimDocs) {
      if (!d.analysis?.extractedData && !d.analysis?.visionData) continue;

      const content = d.analysis.extractedData as any;
      const vision = d.analysis.visionData as any;

      switch (d.type) {
        case 'NRIC':
        case 'MYKAD_FRONT':
          dataBag.nric = content;
          break;
        case 'POLICY_DOCUMENT':
          dataBag.policy = content;
          break;
        case 'VEHICLE_REG_CARD':
          dataBag.registrationCard = content;
          break;
        case 'POLICE_REPORT':
          dataBag.policeReport = content;
          break;
        case 'REPAIR_QUOTATION':
          dataBag.repairQuotation = content;
          break;
        case 'DAMAGE_PHOTO':
          if (vision) dataBag.damagePhotos.push(vision);
          break;
      }
    }

    // 3. Run Engine
    const report = this.trinity.auditClaim(dataBag);

    // 4. Save Trinity Check
    await this.prisma.trinityCheck.create({
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
  }

  private getExtractionPrompt(type: DocumentType, text?: string): string {
    const schemas = {
      NRIC: `
      Extract Malaysian NRIC details into this specific JSON structure:
      {
        "full_name": "string",
        "id_number": "string (without hyphens)",
        "address": "string",
        "date_of_birth": "string (YYYY-MM-DD)",
        "gender": "MALE" | "FEMALE",
        "confidence_score": number (0-1)
      }`,
      POLICY_DOCUMENT: `
      Extract Insurance Policy details into this specific JSON structure:
      {
        "policy_number": "string",
        "policy_holder_name": "string",
        "policy_holder_nric": "string",
        "vehicle_plate_number": "string",
        "vehicle_chassis_number": "string",
        "vehicle_make_model": "string",
        "period_from": "string (YYYY-MM-DD)",
        "period_to": "string (YYYY-MM-DD)",
        "sum_insured": number,
        "coverage_type": "Comprehensive" | "Third Party",
        "confidence_score": number (0-1)
      }`,
      VEHICLE_REG_CARD: `
      Extract Vehicle Registration Card (VOC) details into this specific JSON structure:
      {
        "registration_number": "string (Plate Number)",
        "owner_name": "string",
        "owner_nric": "string",
        "chassis_number": "string",
        "engine_number": "string",
        "make": "string",
        "model": "string",
        "manufacturing_year": "string",
        "confidence_score": number (0-1)
      }`,
      POLICE_REPORT: `
      Extract Police Report details into this specific JSON structure:
      {
        "report_number": "string",
        "report_date": "string (YYYY-MM-DD)",
        "incident_date_time": "string (ISO8601 if possible)",
        "incident_location": "string",
        "complainant_name": "string",
        "complainant_nric": "string",
        "vehicle_number_involved": "string",
        "incident_description": "string",
        "confidence_score": number (0-1)
      }`,
      REPAIR_QUOTATION: `
      Extract Repair Quotation details into this specific JSON structure:
      {
        "quotation_number": "string",
        "workshop_name": "string",
        "workshop_reg_no": "string",
        "vehicle_plate": "string",
        "total_parts_amount": number,
        "total_labor_amount": number,
        "total_amount": number,
        "parts_list": [
          {
            "item_name": "string",
            "quantity": number,
            "price": number
          }
        ],
        "confidence_score": number (0-1)
      }`,
      DAMAGE_PHOTO: `
      Analyze this vehicle damage photo and extract insights into this specific JSON structure:
      {
        "vehicle_detected": boolean,
        "plate_number_visible": "string (the license plate if visible, else null)",
        "damage_severity": "Minor" | "Moderate" | "Severe",
        "damage_location": ["string (e.g. Front Bumper, Left Headlight)"],
        "parts_to_replace": ["string"],
        "is_internal_damage_likely": boolean,
        "confidence_score": number (0-1)
      }`,
      MYKAD_FRONT: `
      Extract Malaysian MyKad (Front) details into this specific JSON structure:
      {
        "full_name": "string",
        "id_number": "string (without hyphens)",
        "address": "string",
        "date_of_birth": "string (YYYY-MM-DD)",
        "gender": "MALE" | "FEMALE",
        "confidence_score": number (0-1)
      }`,
    };

    const specificPrompt = (schemas as any)[type] || `Extract key information in JSON format.`;

    let prompt = `You are a specialized data extraction AI.
    ${specificPrompt}
    
    Ensure the output is valid JSON only. Do not wrap in markdown blocks.`;

    if (text) {
      prompt += `
    
    DOCUMENT TEXT:
    ${text}`;
    }

    return prompt;
  }
}
