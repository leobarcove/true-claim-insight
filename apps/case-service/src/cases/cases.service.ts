import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CaseChannel,
  CaseInitiator,
  CaseStatus,
  ClaimCategory,
  DocumentType,
  Prisma,
  TenantType,
  TravelClaimType,
} from '@prisma/client';
import {
  CaseAnswers,
  computeCompleteness,
  computeDeadlineFlags,
  getFlow,
  getStep,
  resolveNextStep,
  validateAnswer,
  TRAVEL_CLAIM_TYPE_LABELS,
} from '@tci/shared-types';
import { PrismaService } from '../config/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { StorageService } from '../common/services/storage.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { DocumentValidationService } from './document-validation.service';
import { EncryptionService } from '@tci/crypto';
import { CreateCaseDto } from './dto/create-case.dto';
import { PatchAnswerDto } from './dto/patch-answer.dto';
import { CaseQueryDto } from './dto/review-case.dto';

/**
 * Allowed case lifecycle transitions. Conversion of MEDICAL cases is
 * additionally gated behind REFERRED_TO_EXPERT (see convert()) — medical
 * claims are never auto-assessed, only form + expert routing + insurer
 * handback.
 */
const CASE_STATUS_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  [CaseStatus.DRAFT]: [CaseStatus.IN_PROGRESS, CaseStatus.SUBMITTED, CaseStatus.ABANDONED],
  [CaseStatus.IN_PROGRESS]: [CaseStatus.SUBMITTED, CaseStatus.ABANDONED],
  [CaseStatus.SUBMITTED]: [
    CaseStatus.UNDER_REVIEW,
    CaseStatus.INFO_REQUESTED,
    CaseStatus.REFERRED_TO_EXPERT,
    CaseStatus.CONVERTED,
    CaseStatus.REJECTED,
  ],
  [CaseStatus.UNDER_REVIEW]: [
    CaseStatus.INFO_REQUESTED,
    CaseStatus.REFERRED_TO_EXPERT,
    CaseStatus.CONVERTED,
    CaseStatus.REJECTED,
  ],
  [CaseStatus.INFO_REQUESTED]: [CaseStatus.SUBMITTED, CaseStatus.ABANDONED],
  [CaseStatus.REFERRED_TO_EXPERT]: [CaseStatus.CONVERTED, CaseStatus.REJECTED],
  [CaseStatus.CONVERTED]: [],
  [CaseStatus.REJECTED]: [],
  [CaseStatus.ABANDONED]: [],
};

/**
 * Intake answers whose raw value must never persist in `Case.answers`.
 *
 * The promoted column holds the encrypted value; the answer bag keeps only a
 * mask. Without this, encrypting the column would be theatre — the readable
 * copy would still sit in the JSON blob, in every backup, and in the review
 * screen. The mask still reads as "answered" to the flow engine, so the
 * conversation does not loop back and ask again.
 */
const SENSITIVE_ANSWER_STEPS = new Set(['bank-account-number']);

/** Statuses in which intake answers may still be edited. */
const EDITABLE_STATUSES: CaseStatus[] = [
  CaseStatus.DRAFT,
  CaseStatus.IN_PROGRESS,
  CaseStatus.INFO_REQUESTED,
];

@Injectable()
export class CasesService {
  private readonly logger = new Logger(CasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly documentValidation: DocumentValidationService,
    private readonly configService: ConfigService,
    private readonly encryption: EncryptionService,
    private readonly auditService: AuditService
  ) {}

  /**
   * Replace sensitive answers with a display mask before persisting.
   * The real value lives only in its encrypted column.
   */
  private redactSensitiveAnswers(answers: CaseAnswers): CaseAnswers {
    const stored: CaseAnswers = { ...answers };
    for (const stepId of SENSITIVE_ANSWER_STEPS) {
      const value = stored[stepId];
      if (value === undefined || value === null || value === '') continue;
      if (typeof value === 'string' && value.startsWith('••••')) continue; // already masked
      stored[stepId] = `••••${this.encryption.lastDigits(String(value)) ?? ''}`;
    }
    return stored;
  }

  /**
   * Evidential audit record for case activity. Intake and vetting decisions
   * (above all the case→claim conversion — the insurer handback) must be
   * reconstructable for BNM examination (FSA s.146) and PD 12.8 records
   * requirements; oldValues/newValues carry the before/after state.
   */
  private async audit(
    entityId: string,
    action: string,
    tenantContext: TenantContext,
    options: { oldValues?: unknown; newValues?: unknown; metadata?: unknown } = {}
  ) {
    // Shared fail-soft writer (its own try/catch logs failures loudly); one row
    // shape across every service, so the trail stays queryable as a whole.
    await this.auditService.record({
      entityId,
      entityType: 'CASE',
      action,
      oldValues: options.oldValues,
      newValues: options.newValues,
      metadata: options.metadata,
      tenantId: tenantContext.tenantId,
      userId: tenantContext.userRole === 'CLAIMANT' ? null : tenantContext.userId,
      actorId: tenantContext.userId,
      actorType: tenantContext.userRole ?? 'SYSTEM',
    });
  }

  // -------------------------------------------------------------------------
  // Create
  // -------------------------------------------------------------------------

  async create(dto: CreateCaseDto, tenantContext: TenantContext) {
    const isClaimant = tenantContext.userRole === 'CLAIMANT';
    const channel = dto.channel ?? (isClaimant ? CaseChannel.WEB_CHAT : CaseChannel.STAFF);
    const initiatedBy =
      dto.initiatedBy ?? (isClaimant ? CaseInitiator.CLAIMANT : CaseInitiator.STAFF);

    const claimantId = await this.resolveClaimantId(dto, tenantContext);
    const caseNumber = await this.generateCaseNumber();

    const flow = getFlow(dto.travelClaimType);
    const answers: CaseAnswers = (dto.answers as CaseAnswers) ?? {};

    // Validate any pre-filled answers (staff form / future SYSTEM cases)
    for (const [stepId, value] of Object.entries(answers)) {
      const step = getStep(flow, stepId);
      if (!step) throw new BadRequestException(`Unknown step: ${stepId}`);
      const result = validateAnswer(step, value);
      if (!result.valid) {
        throw new BadRequestException(`Invalid answer for ${stepId}: ${result.error}`);
      }
    }

    // Promote answers first: a matched policy identifies the insurer, which is
    // what nominates the handling firm for self-service intake.
    const promoted = await this.promoteAnswers(answers);
    const tenantId = await this.resolveCaseTenant(tenantContext, promoted.policyId as string | null);
    const currentStepId =
      answers[flow.entryStepId] === undefined
        ? flow.entryStepId
        : resolveNextStep(flow, flow.entryStepId, answers) ?? flow.entryStepId;

    const created = await this.prisma.case.create({
      data: {
        caseNumber,
        tenantId,
        channel,
        initiatedBy,
        category: ClaimCategory.TRAVEL,
        travelClaimType: dto.travelClaimType,
        claimantId,
        createdByUserId: isClaimant ? null : tenantContext.userId,
        currentStepId,
        answers: this.redactSensitiveAnswers(answers) as Prisma.InputJsonValue,
        sourceMeta: (dto.sourceMeta as Prisma.InputJsonValue) ?? undefined,
        status: Object.keys(answers).length > 0 ? CaseStatus.IN_PROGRESS : CaseStatus.DRAFT,
        ...promoted,
      },
      include: { claimant: true, policy: true },
    });

    this.logger.log(`Case created: ${created.caseNumber} (${channel}, ${dto.travelClaimType})`);
    await this.audit(created.id, 'CASE_CREATED', tenantContext, {
      newValues: {
        caseNumber: created.caseNumber,
        channel,
        initiatedBy,
        travelClaimType: dto.travelClaimType,
        claimantId,
      },
    });
    return this.withFlowState(created);
  }

  // -------------------------------------------------------------------------
  // Read
  // -------------------------------------------------------------------------

  async findAll(query: CaseQueryDto, tenantContext: TenantContext) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Number(query.limit) || 20);

    const where: Prisma.CaseWhereInput = this.tenantFilter(tenantContext);
    if (query.status) where.status = query.status as CaseStatus;
    if (query.travelClaimType) where.travelClaimType = query.travelClaimType as TravelClaimType;
    if (query.channel) where.channel = query.channel as CaseChannel;
    if (query.search) {
      where.OR = [
        { caseNumber: { contains: query.search, mode: 'insensitive' } },
        { destination: { contains: query.search, mode: 'insensitive' } },
        { policyNumberRaw: { contains: query.search, mode: 'insensitive' } },
        { claimant: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const [cases, total, requirements] = await Promise.all([
      this.prisma.case.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        // Queue listing never needs payout details or the raw answer blob —
        // they stay on the detail endpoint, which is role-gated separately.
        omit: {
          bankName: true,
          bankAccountNumberEncrypted: true,
          bankAccountLast4: true,
          bankAccountHolderName: true,
          answers: true,
        },
        include: {
          claimant: { select: { id: true, fullName: true, phoneNumber: true } },
          policy: { select: { id: true, policyNumber: true, insuredName: true } },
          documents: { select: { documentType: true } },
        },
      }),
      this.prisma.case.count({ where }),
      this.travelEvidenceRequirements(),
    ]);

    const data = cases.map(caseRow => ({
      ...caseRow,
      completeness: caseRow.travelClaimType
        ? computeCompleteness(
            caseRow.documents.map(doc => doc.documentType as DocumentType),
            requirements.filter(req => req.travelClaimType === caseRow.travelClaimType)
          )
        : null,
    }));

    // Status breakdown for the queue tab bar
    const grouped = await this.prisma.case.groupBy({
      by: ['status'],
      where: this.tenantFilter(tenantContext),
      _count: { _all: true },
    });
    const statusBreakdown = Object.fromEntries(
      grouped.map(group => [group.status, group._count._all])
    );

    return {
      cases: data,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      statusBreakdown,
    };
  }

  async findMine(tenantContext: TenantContext) {
    if (tenantContext.userRole !== 'CLAIMANT') {
      throw new ForbiddenException('Only claimants can list their own cases');
    }
    const cases = await this.prisma.case.findMany({
      where: { claimantId: tenantContext.userId },
      orderBy: { createdAt: 'desc' },
      omit: { bankAccountNumberEncrypted: true },
      include: { documents: true, policy: { select: { policyNumber: true } } },
    });
    return cases.map(caseRow => this.withFlowState(caseRow));
  }

  async findOne(id: string, tenantContext: TenantContext) {
    const caseRow = await this.prisma.case.findUnique({
      where: { id },
      // Ciphertext has no business reaching a browser: the last-4 is enough for
      // display and the full value comes only from the audited reveal endpoint.
      omit: { bankAccountNumberEncrypted: true },
      include: {
        claimant: true,
        policy: true,
        documents: { orderBy: { createdAt: 'asc' } },
        convertedClaim: { select: { id: true, claimNumber: true, status: true } },
      },
    });
    if (!caseRow) throw new NotFoundException('Case not found');
    this.assertAccess(caseRow, tenantContext);

    // Operator opening a freshly submitted case moves it into vetting.
    if (
      caseRow.status === CaseStatus.SUBMITTED &&
      tenantContext.userRole !== 'CLAIMANT'
    ) {
      await this.prisma.case.update({
        where: { id },
        data: { status: CaseStatus.UNDER_REVIEW },
      });
      await this.audit(id, 'CASE_STATUS_CHANGED', tenantContext, {
        oldValues: { status: CaseStatus.SUBMITTED },
        newValues: { status: CaseStatus.UNDER_REVIEW },
        metadata: { trigger: 'operator opened case detail' },
      });
      caseRow.status = CaseStatus.UNDER_REVIEW;
    }

    const requirements = caseRow.travelClaimType
      ? (await this.travelEvidenceRequirements()).filter(
          req => req.travelClaimType === caseRow.travelClaimType
        )
      : [];

    return {
      ...this.withFlowState(caseRow),
      evidenceRequirements: requirements,
      completeness: caseRow.travelClaimType
        ? computeCompleteness(
            caseRow.documents.map(doc => doc.documentType as DocumentType),
            requirements
          )
        : null,
    };
  }

  // -------------------------------------------------------------------------
  // Intake: answers, documents, submit
  // -------------------------------------------------------------------------

  async patchAnswer(id: string, dto: PatchAnswerDto, tenantContext: TenantContext) {
    const caseRow = await this.getEditableCase(id, tenantContext);
    const flow = getFlow(caseRow.travelClaimType as TravelClaimType);
    const step = getStep(flow, dto.stepId);
    if (!step) throw new BadRequestException(`Unknown step: ${dto.stepId}`);

    const result = validateAnswer(step, dto.value);
    if (!result.valid) {
      return { accepted: false, error: result.error, step };
    }

    const answers = { ...(caseRow.answers as CaseAnswers), [dto.stepId]: dto.value };
    const promoted = await this.promoteAnswers(answers);
    const nextStepId = resolveNextStep(flow, dto.stepId, answers);

    const warnings: string[] = [];
    if (dto.stepId === 'incident-date') {
      warnings.push(...computeDeadlineFlags(String(dto.value)).warnings);
    }
    if (dto.stepId === 'policy-number' && promoted.needsPolicyReview) {
      warnings.push(
        'We could not find that policy number in our records. You can continue — our team will verify the policy manually.'
      );
    }

    const updated = await this.prisma.case.update({
      where: { id },
      data: {
        answers: this.redactSensitiveAnswers(answers) as Prisma.InputJsonValue,
        currentStepId: nextStepId,
        status:
          caseRow.status === CaseStatus.DRAFT ? CaseStatus.IN_PROGRESS : caseRow.status,
        ...promoted,
      },
      include: { policy: true },
    });

    return {
      accepted: true,
      case: this.withFlowState(updated),
      nextStep: nextStepId ? getStep(flow, nextStepId) : null,
      warnings,
    };
  }

  async uploadDocument(
    id: string,
    file: { toBuffer: () => Promise<Buffer>; filename: string; mimetype: string; fields?: any },
    tenantContext: TenantContext
  ) {
    const caseRow = await this.getEditableCase(id, tenantContext);

    const documentType =
      (file.fields?.type?.value as DocumentType) || DocumentType.OTHER_DOCUMENT;
    const stepId = (file.fields?.stepId?.value as string) || null;

    const buffer = await file.toBuffer();
    const storagePath = await this.storageService.uploadFile(
      buffer,
      file.filename,
      file.mimetype,
      `cases/${id}`
    );

    const document = await this.prisma.caseDocument.create({
      data: {
        caseId: caseRow.id,
        tenantId: caseRow.tenantId,
        documentType,
        fileName: file.filename,
        storagePath,
        mimeType: file.mimetype,
        sizeBytes: buffer.length,
        stepId,
      },
    });

    // Local-LLM validation hook (slice 1: records SKIPPED)
    const validation = await this.documentValidation.validate(document);
    const stored = await this.prisma.caseDocument.update({
      where: { id: document.id },
      data: { validationStatus: validation.status, validationNote: validation.note },
    });
    await this.audit(caseRow.id, 'CASE_DOCUMENT_UPLOADED', tenantContext, {
      newValues: { documentId: stored.id, documentType, fileName: file.filename, stepId },
    });
    return stored;
  }

  async submit(id: string, tenantContext: TenantContext) {
    const caseRow = await this.getEditableCase(id, tenantContext);
    const flow = getFlow(caseRow.travelClaimType as TravelClaimType);
    const answers = caseRow.answers as CaseAnswers;

    // Walk the flow from entry and require every reachable mandatory step
    // (documents included — their answers carry the CaseDocument id).
    const missing: string[] = [];
    let stepId: string | null = flow.entryStepId;
    const seen = new Set<string>();
    while (stepId && !seen.has(stepId)) {
      seen.add(stepId);
      const step = getStep(flow, stepId);
      if (!step) break;
      if (step.id !== 'review' && !step.optional && answers[step.id] === undefined) {
        missing.push(step.label);
      }
      const next: string | null =
        typeof step.next === 'function' ? step.next(answers) : step.next;
      stepId = next;
    }
    if (missing.length > 0) {
      throw new BadRequestException(
        `Please complete the following before submitting: ${missing.join(', ')}`
      );
    }

    this.assertTransition(caseRow.status, CaseStatus.SUBMITTED);
    const updated = await this.prisma.case.update({
      where: { id },
      data: { status: CaseStatus.SUBMITTED, submittedAt: new Date() },
    });
    this.logger.log(`Case submitted: ${updated.caseNumber}`);
    await this.audit(id, 'CASE_SUBMITTED', tenantContext, {
      oldValues: { status: caseRow.status },
      newValues: { status: CaseStatus.SUBMITTED, submittedAt: updated.submittedAt },
    });
    return this.withFlowState(updated);
  }

  // -------------------------------------------------------------------------
  // Operator vetting actions
  // -------------------------------------------------------------------------

  async requestInfo(id: string, note: string, tenantContext: TenantContext) {
    return this.transitionWithNote(id, CaseStatus.INFO_REQUESTED, note, tenantContext);
  }

  async referToExpert(id: string, note: string, tenantContext: TenantContext) {
    const caseRow = await this.getStaffCase(id, tenantContext);
    if (caseRow.travelClaimType !== TravelClaimType.MEDICAL) {
      throw new BadRequestException('Only medical cases can be referred to an expert');
    }
    return this.transitionWithNote(id, CaseStatus.REFERRED_TO_EXPERT, note, tenantContext);
  }

  async reject(id: string, note: string, tenantContext: TenantContext) {
    return this.transitionWithNote(id, CaseStatus.REJECTED, note, tenantContext);
  }

  /**
   * Decrypt the payout account number for a single case.
   *
   * Decryption is a deliberate, audited act rather than a side effect of
   * loading a case: BNM examination and PDPA both ask *who* accessed personal
   * data, and this is the chokepoint that can answer it. Restricted to firm
   * admins at the controller.
   */
  async revealPayoutDetails(id: string, tenantContext: TenantContext) {
    const caseRow = await this.getStaffCase(id, tenantContext);

    // Fetch the ciphertext in its own scoped read rather than widening
    // getStaffCase, which every status transition also uses: the ciphertext
    // should be loaded only where it is about to be decrypted. The access check
    // above has already run.
    const secret = await this.prisma.case.findUniqueOrThrow({
      where: { id },
      select: { bankAccountNumberEncrypted: true },
    });
    const accountNumber = await this.encryption.decrypt(secret.bankAccountNumberEncrypted);

    await this.audit(id, 'PAYOUT_DETAILS_REVEALED', tenantContext, {
      metadata: { reason: 'operator requested payout details', last4: caseRow.bankAccountLast4 },
    });

    return {
      bankName: caseRow.bankName,
      bankAccountHolderName: caseRow.bankAccountHolderName,
      bankAccountNumber: accountNumber,
    };
  }

  async linkPolicy(id: string, policyId: string, tenantContext: TenantContext) {
    const caseRow = await this.getStaffCase(id, tenantContext);
    const policy = await this.prisma.policy.findUnique({ where: { id: policyId } });
    if (!policy) throw new NotFoundException('Policy not found');
    const updated = await this.prisma.case.update({
      where: { id },
      data: { policyId, needsPolicyReview: false },
      include: { policy: true },
    });
    await this.audit(id, 'CASE_POLICY_LINKED', tenantContext, {
      oldValues: { policyId: caseRow.policyId, needsPolicyReview: caseRow.needsPolicyReview },
      newValues: { policyId, policyNumber: policy.policyNumber, needsPolicyReview: false },
    });
    return updated;
  }

  /**
   * Convert a vetted Case into the insurer-facing Claim (+ TravelClaim),
   * copying intake documents. This is the MSIG handback record.
   */
  async convert(id: string, tenantContext: TenantContext) {
    const caseRow = await this.getStaffCase(id, tenantContext);

    // Medical claims must pass through expert review — never auto-assessed.
    if (
      caseRow.travelClaimType === TravelClaimType.MEDICAL &&
      caseRow.status !== CaseStatus.REFERRED_TO_EXPERT
    ) {
      throw new BadRequestException(
        'Medical cases must be referred to a claims expert before conversion'
      );
    }
    this.assertTransition(caseRow.status, CaseStatus.CONVERTED);

    if (!caseRow.claimantId) {
      throw new BadRequestException('Case has no claimant — link a claimant before converting');
    }
    if (!caseRow.incidentDate) {
      throw new BadRequestException('Case has no incident date — request more info first');
    }

    const answers = caseRow.answers as CaseAnswers;
    const travelClaimType = caseRow.travelClaimType as TravelClaimType;
    const claimNumber = await this.generateClaimNumber();
    const policyNumber =
      caseRow.policyNumberRaw ?? caseRow.policy?.policyNumber ?? 'PENDING-VERIFICATION';

    const description = this.buildClaimDescription(travelClaimType, answers);
    const delayHours = this.computeDelayHours(answers);
    const estimatedAmount = answers['estimated-amount'];

    const documents = await this.prisma.caseDocument.findMany({ where: { caseId: id } });

    const converted = await this.prisma.$transaction(async tx => {
      const claim = await tx.claim.create({
        data: {
          claimNumber,
          category: ClaimCategory.TRAVEL,
          claimType: null,
          policyNumber,
          claimantId: caseRow.claimantId!,
          incidentDate: caseRow.incidentDate!,
          incidentLocation: { destination: caseRow.destination ?? 'Unknown' },
          description,
          tenantId: caseRow.tenantId,
          // The insurer this claim is handed back to — the matched policy's
          // tenant (e.g. MSIG) when known, else the handling tenant.
          insurerTenantId: caseRow.policy?.tenantId ?? caseRow.tenantId,
          userId: tenantContext.userId,
          createdById: tenantContext.userId,
          updatedById: tenantContext.userId,
          estimatedLossAmount:
            estimatedAmount !== undefined ? Number(estimatedAmount) : null,
        },
      });

      await tx.travelClaim.create({
        data: {
          claimId: claim.id,
          tenantId: caseRow.tenantId,
          travelClaimType,
          policyId: caseRow.policyId,
          tripStartDate: this.answerDate(answers['trip-start']),
          tripEndDate: this.answerDate(answers['trip-end']),
          destinationCountry: caseRow.destination,
          airline: this.answerString(answers['airline']),
          flightNumber: this.answerString(answers['flight-number']),
          scheduledDeparture: this.answerDate(answers['scheduled-departure']),
          actualDeparture: this.answerDate(answers['actual-departure']),
          delayHours,
          baggageTagNumber: this.answerString(answers['baggage-tag']),
          treatmentCountry: this.answerString(answers['treatment-country']),
          hospitalName: this.answerString(answers['hospital-name']),
          referredToExpert: caseRow.status === CaseStatus.REFERRED_TO_EXPERT,
          cancellationReason: this.answerString(answers['cancellation-reason']),
          estimatedAmountRm:
            estimatedAmount !== undefined ? Number(estimatedAmount) : null,
        },
      });

      // Copy intake documents into the claim's document set so the standard
      // evidence checklist / signing / analysis pipeline applies unchanged.
      for (const doc of documents) {
        await tx.document.create({
          data: {
            claimId: claim.id,
            type: doc.documentType,
            filename: doc.fileName,
            storageUrl: doc.storagePath,
            fileSize: doc.sizeBytes,
            mimeType: doc.mimeType,
            tenantId: caseRow.tenantId,
            userId: tenantContext.userId,
            metadata: { sourceCaseId: caseRow.id, sourceCaseDocumentId: doc.id },
          },
        });
      }

      return tx.case.update({
        where: { id },
        data: { status: CaseStatus.CONVERTED, convertedClaimId: claim.id },
        include: { convertedClaim: { select: { id: true, claimNumber: true } } },
      });
    });

    this.logger.log(
      `Case ${converted.caseNumber} converted to claim ${converted.convertedClaim?.claimNumber}`
    );
    // The conversion is the insurer handback — the most consequential decision
    // in the intake flow, so its audit record carries the full linkage.
    await this.audit(id, 'CASE_CONVERTED', tenantContext, {
      oldValues: { status: caseRow.status },
      newValues: {
        status: CaseStatus.CONVERTED,
        claimId: converted.convertedClaimId,
        claimNumber: converted.convertedClaim?.claimNumber,
        policyNumber,
        documentsCopied: documents.length,
      },
    });
    return converted;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private tenantFilter(tenantContext: TenantContext): Prisma.CaseWhereInput {
    if (tenantContext.userRole === 'CLAIMANT') {
      return { claimantId: tenantContext.userId };
    }
    if (tenantContext.userRole === 'SUPER_ADMIN') return {};
    return { tenantId: tenantContext.tenantId };
  }

  private assertAccess(
    caseRow: { tenantId: string; claimantId: string | null },
    tenantContext: TenantContext
  ) {
    if (tenantContext.userRole === 'SUPER_ADMIN') return;
    if (tenantContext.userRole === 'CLAIMANT') {
      if (caseRow.claimantId !== tenantContext.userId) {
        throw new NotFoundException('Case not found');
      }
      return;
    }
    if (caseRow.tenantId !== tenantContext.tenantId) {
      // Defence-in-depth: cross-tenant reads must look like a 404.
      throw new NotFoundException('Case not found');
    }
  }

  private async getEditableCase(id: string, tenantContext: TenantContext) {
    const caseRow = await this.prisma.case.findUnique({
      where: { id },
      include: { policy: true },
    });
    if (!caseRow) throw new NotFoundException('Case not found');
    this.assertAccess(caseRow, tenantContext);
    if (!EDITABLE_STATUSES.includes(caseRow.status)) {
      throw new BadRequestException(`Case can no longer be edited (status: ${caseRow.status})`);
    }
    if (!caseRow.travelClaimType) {
      throw new BadRequestException('Case has no travel claim type');
    }
    return caseRow;
  }

  private async getStaffCase(id: string, tenantContext: TenantContext) {
    if (tenantContext.userRole === 'CLAIMANT') {
      throw new ForbiddenException('Not permitted');
    }
    const caseRow = await this.prisma.case.findUnique({
      where: { id },
      include: { policy: true },
    });
    if (!caseRow) throw new NotFoundException('Case not found');
    this.assertAccess(caseRow, tenantContext);
    return caseRow;
  }

  private assertTransition(from: CaseStatus, to: CaseStatus) {
    if (!CASE_STATUS_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(`Cannot move case from ${from} to ${to}`);
    }
  }

  private async transitionWithNote(
    id: string,
    to: CaseStatus,
    note: string,
    tenantContext: TenantContext
  ) {
    const caseRow = await this.getStaffCase(id, tenantContext);
    this.assertTransition(caseRow.status, to);
    const updated = await this.prisma.case.update({
      where: { id },
      data: { status: to, reviewNote: note },
    });
    this.logger.log(`Case ${updated.caseNumber} → ${to}`);
    await this.audit(id, 'CASE_STATUS_CHANGED', tenantContext, {
      oldValues: { status: caseRow.status, reviewNote: caseRow.reviewNote },
      newValues: { status: to, reviewNote: note },
    });
    return updated;
  }

  /**
   * Map well-known step answers onto promoted Case columns (queue filtering,
   * deadline flags, payout details) and attempt policy auto-match.
   */
  private async promoteAnswers(answers: CaseAnswers): Promise<Partial<Prisma.CaseUncheckedCreateInput>> {
    const promoted: Partial<Prisma.CaseUncheckedCreateInput> = {};

    const policyNumber = this.answerString(answers['policy-number']);
    if (policyNumber !== undefined) {
      if (policyNumber.trim().toLowerCase() === 'skip') {
        promoted.policyNumberRaw = null;
        promoted.needsPolicyReview = true;
      } else {
        promoted.policyNumberRaw = policyNumber.trim();
        // TPA-wide match: policies belong to insurer tenants (MSIG etc.),
        // so the lookup deliberately spans tenants.
        const policy = await this.prisma.policy.findFirst({
          where: { policyNumber: { equals: policyNumber.trim(), mode: 'insensitive' } },
        });
        promoted.policyId = policy?.id ?? null;
        promoted.needsPolicyReview = !policy;
      }
    }

    const incident = answers['incident-date'];
    if (incident !== undefined) {
      const date = new Date(String(incident));
      if (!Number.isNaN(date.getTime())) {
        const flags = computeDeadlineFlags(date);
        promoted.incidentDate = date;
        promoted.notifiedLate = flags.notifiedLate;
        promoted.outOfWindow = flags.outOfWindow;
      }
    }

    const destination = this.answerString(answers['destination']);
    if (destination !== undefined) promoted.destination = destination;
    const bankName = this.answerString(answers['bank-name']);
    if (bankName !== undefined) promoted.bankName = bankName;
    const bankAccount = this.answerString(answers['bank-account-number']);
    if (bankAccount !== undefined) {
      // Encrypted at rest; only the last 4 digits stay readable so operator
      // screens can identify the account without a decrypt (PDPA).
      promoted.bankAccountNumberEncrypted = await this.encryption.encrypt(bankAccount);
      promoted.bankAccountLast4 = this.encryption.lastDigits(bankAccount);
    }
    const bankHolder = this.answerString(answers['bank-account-holder']);
    if (bankHolder !== undefined) promoted.bankAccountHolderName = bankHolder;

    return promoted;
  }

  private async resolveClaimantId(
    dto: CreateCaseDto,
    tenantContext: TenantContext
  ): Promise<string | null> {
    // Claimant self-serve: JWT sub IS the claimant id.
    if (tenantContext.userRole === 'CLAIMANT') return tenantContext.userId;

    if (dto.claimantId) return dto.claimantId;
    if (dto.claimantPhone) {
      // Fallback only. The gateway normally resolves the claimant (it owns the
      // identity context) and passes claimantId. Deliberately does NOT write the
      // NRIC: that needs both the encryption key and the index pepper, and
      // keeping identity writes in one service is the point of ownership
      // exception #6. A staff-supplied NRIC arrives via the gateway path.
      const claimant = await this.prisma.claimant.upsert({
        where: { phoneNumber: dto.claimantPhone },
        update: { fullName: dto.claimantFullName || undefined },
        create: {
          phoneNumber: dto.claimantPhone,
          fullName: dto.claimantFullName,
        },
      });
      return claimant.id;
    }
    return null;
  }

  /**
   * Which tenant handles (owns) the case.
   *
   * Staff cases belong to the staff member's organisation. Claimant self-serve
   * cases must be routed to a handling firm **explicitly** — resolved from the
   * matched policy's insurer panel where known, otherwise from configuration.
   *
   * Deliberately does NOT pick "the first ADJUSTING_FIRM found": that shortcut
   * silently assumes a single adjusting firm per deployment, which forecloses
   * multi-firm operation and produces arbitrary routing the moment a second
   * firm exists. Panel mapping moves into per-tenant config in Phase 2 (see
   * docs/MASTER_PLAN.md §4.2, §6.5).
   */
  private async resolveCaseTenant(
    tenantContext: TenantContext,
    policyId?: string | null
  ): Promise<string> {
    if (tenantContext.userRole !== 'CLAIMANT') return tenantContext.tenantId;

    // 1. Panel routing: the insurer that issued the policy nominates the
    //    handling firm via its tenant settings.
    if (policyId) {
      const policy = await this.prisma.policy.findUnique({
        where: { id: policyId },
        include: { tenant: { select: { settings: true } } },
      });
      const nominated = (policy?.tenant?.settings as { handlingFirmTenantId?: string } | null)
        ?.handlingFirmTenantId;
      if (nominated && (await this.isAdjustingFirm(nominated))) return nominated;
    }

    // 2. Configured default handling firm for this deployment.
    const configured = this.configService.get<string>('HANDLING_FIRM_TENANT_ID');
    if (configured && (await this.isAdjustingFirm(configured))) return configured;

    throw new BadRequestException(
      'No handling organisation is configured for self-service intake. Set HANDLING_FIRM_TENANT_ID, ' +
        "or nominate a handling firm in the insurer tenant's settings."
    );
  }

  private async isAdjustingFirm(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { type: true },
    });
    if (!tenant) {
      this.logger.warn(`Handling firm ${tenantId} does not exist`);
      return false;
    }
    if (tenant.type !== TenantType.ADJUSTING_FIRM) {
      this.logger.warn(`Handling firm ${tenantId} is not an ADJUSTING_FIRM tenant`);
      return false;
    }
    return true;
  }

  /** CSE-YYYY-NNNNNN from a dedicated Postgres sequence — race-safe. */
  private async generateCaseNumber(): Promise<string> {
    const [{ nextval }] = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('case_number_seq')
    `;
    const year = new Date().getFullYear();
    return `CSE-${year}-${String(nextval).padStart(6, '0')}`;
  }

  /**
   * Claim numbers share the CLM namespace with motor/flood claims. Matches
   * the existing count-based pattern (see flood-claims.service.ts) — kept
   * consistent deliberately; refactoring claim numbering is out of scope.
   */
  private async generateClaimNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.claim.count();
    return `CLM-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  private async travelEvidenceRequirements() {
    return this.prisma.evidenceRequirement.findMany({
      where: { category: ClaimCategory.TRAVEL, tenantId: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Attach the current flow step definition so channels can resume. */
  private withFlowState<T extends { travelClaimType: TravelClaimType | null; currentStepId: string | null }>(
    caseRow: T
  ) {
    if (!caseRow.travelClaimType) return { ...caseRow, currentStep: null };
    const flow = getFlow(caseRow.travelClaimType);
    const currentStep = caseRow.currentStepId ? getStep(flow, caseRow.currentStepId) : null;
    return { ...caseRow, currentStep: currentStep ?? null };
  }

  private buildClaimDescription(type: TravelClaimType, answers: CaseAnswers): string {
    const label = TRAVEL_CLAIM_TYPE_LABELS[type];
    const detail =
      this.answerString(answers['damage-description']) ??
      this.answerString(answers['contents-description']) ??
      this.answerString(answers['diagnosis-description']) ??
      this.answerString(answers['cancellation-reason']) ??
      '';
    return detail ? `Travel claim — ${label}: ${detail}` : `Travel claim — ${label}`;
  }

  private computeDelayHours(answers: CaseAnswers): number | null {
    const scheduled = this.answerDate(answers['scheduled-departure']);
    const actual = this.answerDate(answers['actual-departure']);
    if (!scheduled || !actual) return null;
    const hours = (actual.getTime() - scheduled.getTime()) / (1000 * 60 * 60);
    return hours > 0 ? Math.round(hours * 10) / 10 : null;
  }

  private answerString(value: string | number | boolean | undefined): string | undefined {
    if (value === undefined) return undefined;
    const str = String(value).trim();
    return str.length > 0 ? str : undefined;
  }

  private answerDate(value: string | number | boolean | undefined): Date | null {
    if (value === undefined) return null;
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }
}



