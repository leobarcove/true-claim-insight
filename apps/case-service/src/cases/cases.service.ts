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
  ConsentPurpose,
  DocumentType,
  Prisma,
  TenantType,
  TravelClaimType,
} from '@prisma/client';
import {
  ANSWER_MASK_PREFIX,
  branchInputSteps,
  CaseAnswers,
  computeCompleteness,
  computeDeadlineFlags,
  evaluateNext,
  getStep,
  missingSteps,
  pathSteps,
  resolveNextStep,
  REVIEW_STEP_ID,
  SENSITIVE_ANSWER_STEPS,
  validateAnswer,
  TRAVEL_CLAIM_TYPE_LABELS,
  type CaseFlow,
} from '@tci/shared-types';
import { PrismaService } from '../config/prisma.service';
import { FlowsService } from './flows.service';
import { ConsentService } from '../consent/consent.service';
import { AuditService } from '../common/audit/audit.service';
import { StorageService } from '../common/services/storage.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { DocumentValidationService } from './document-validation.service';
import { isInlineRenderable, resolveMimeType } from './document-media';
import { EncryptionService } from '@tci/crypto';
import { NotificationsService } from '../notifications/notifications.service';
import { ClaimsService } from '../claims/claims.service';
import { render } from '../notifications/templates';
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

/**
 * Is this stored answer a display mask rather than the claimant's own value?
 *
 * Shared by the two places that must agree about it, because they disagreed
 * once and it destroyed data. `redactSensitiveAnswers` uses it to avoid
 * masking a mask; `promoteAnswers` uses it to avoid *encrypting* one.
 *
 * The bug it closes: `patchAnswer` rebuilds its working set from the stored
 * answers, which are already redacted, and re-derived the encrypted column
 * from that. On the turn the claimant supplied the account this was correct —
 * the DTO's value overrode the bag. On every turn after, `promoteAnswers` read
 * `••••4567` and encrypted *that* over the real ciphertext. `lastDigits`
 * strips the bullets, so `bankAccountLast4` still read correctly and every
 * screen — including the audited firm-admin reveal — looked right while
 * returning a mask. Measured on the demo book before the fix: 5 of 7 payout
 * accounts held only their own mask.
 *
 * A sensitive value can therefore only be promoted on the turn that supplies
 * it, which is what this predicate enforces. It is not recoverable afterwards
 * by design — the plaintext lives solely in the encrypted column.
 */
function isMaskedAnswer(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(ANSWER_MASK_PREFIX);
}

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
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly flows: FlowsService,
    private readonly consent: ConsentService,
    private readonly claims: ClaimsService
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
      if (isMaskedAnswer(value)) continue; // already masked
      stored[stepId] = `${ANSWER_MASK_PREFIX}${this.encryption.lastDigits(String(value)) ?? ''}`;
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

    // No Case without a lawful basis to process one.
    //
    // Enforced here rather than as a flow step, deliberately. A flow step lives
    // in editable data: an author could reorder or delete it, and the intake
    // would carry on looking healthy while the basis for processing quietly
    // disappeared. Enforced at creation it is channel-proof — web chat,
    // Telegram, staff capture and FNOL email all pass through this method, so
    // none of them can open a Case without it.
    //
    // The machinery for this existed and was tested; nothing called it. That is
    // the §3.6 shape: a control that is real, marked PASS, and does not run on
    // the path that needs it.
    if (claimantId) {
      await this.consent.assertConsent(claimantId, ConsentPurpose.CLAIM_PROCESSING);
    }

    const caseNumber = await this.generateCaseNumber();

    const answers: CaseAnswers = (dto.answers as CaseAnswers) ?? {};

    // Promote answers first: a matched policy identifies the insurer, which is
    // what nominates the handling firm for self-service intake — and the tenant
    // in turn decides whether a tenant-specific flow shadows the platform
    // default. So the tenant has to be known before the flow can be chosen,
    // which is why promotion runs ahead of answer validation rather than after.
    const promoted = await this.promoteAnswers(answers);
    const tenantId = await this.resolveCaseTenant(tenantContext, promoted.policyId as string | null);

    // Chosen once, here, and pinned onto the row below. Every later turn reads
    // the pin instead of re-selecting.
    const { flow, flowDefinitionId, flowVersion } = await this.flows.selectForNewCase(
      dto.travelClaimType,
      tenantId
    );

    // Validate any pre-filled answers (staff form / FNOL email / SYSTEM cases)
    // against the flow this Case will actually walk, not the built-in one.
    for (const [stepId, value] of Object.entries(answers)) {
      const step = getStep(flow, stepId);
      if (!step) throw new BadRequestException(`Unknown step: ${stepId}`);
      // Checked against the whole pre-filled bag, not just itself: a staff form
      // or a parsed FNOL email arrives with every date at once, which is
      // precisely where a trip that ends before it starts gets in.
      const result = validateAnswer(step, value, {
        answers,
        travelClaimType: flow.travelClaimType,
      });
      if (!result.valid) {
        throw new BadRequestException(`Invalid answer for ${stepId}: ${result.error}`);
      }
    }

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
        flowDefinitionId,
        flowVersion,
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

    // Built in two layers deliberately. `scope` is everything *except* the
    // status filter — tenant, channel, type, search — and is what the tab
    // counts are computed over, so the tabs answer "where do my search hits
    // sit" rather than advertising totals the filtered list contradicts.
    // `where` adds the status on top for the rows themselves.
    const scope: Prisma.CaseWhereInput = this.tenantFilter(tenantContext);
    if (query.travelClaimType) scope.travelClaimType = query.travelClaimType as TravelClaimType;
    if (query.channel) scope.channel = query.channel as CaseChannel;
    if (query.search) {
      scope.OR = [
        { caseNumber: { contains: query.search, mode: 'insensitive' } },
        { destination: { contains: query.search, mode: 'insensitive' } },
        { policyNumberRaw: { contains: query.search, mode: 'insensitive' } },
        { claimant: { fullName: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    const where: Prisma.CaseWhereInput = { ...scope };
    if (query.status) where.status = query.status as CaseStatus;

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
          documents: { where: { supersededAt: null }, select: { documentType: true } },
        },
      }),
      this.prisma.case.count({ where }),
      this.evidenceRequirements(),
    ]);

    const data = cases.map(caseRow => {
      const applicable = this.requirementsFor(requirements, caseRow);
      return {
        ...caseRow,
        // Null means "this line has no published checklist", which is a
        // different thing from "nothing uploaded" and reads as a dash.
        completeness: applicable.length
          ? computeCompleteness(
              caseRow.documents.map(doc => doc.documentType as DocumentType),
              applicable
            )
          : null,
      };
    });

    // Status breakdown for the queue tab bar — over `scope`, not `where`: the
    // active tab must not zero out the other tabs' counts, but a search should
    // narrow them, or the bar advertises rows the list will not show.
    const grouped = await this.prisma.case.groupBy({
      by: ['status'],
      where: scope,
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
      include: {
        documents: { where: { supersededAt: null } },
        policy: { select: { policyNumber: true } },
      },
    });
    return Promise.all(cases.map(caseRow => this.withFlowState(caseRow)));
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
        // Superseded uploads stay in the table as evidence of what was sent,
        // but the checklist and the operator's view show only what counts.
        documents: { where: { supersededAt: null }, orderBy: { createdAt: 'asc' } },
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

    const requirements = this.requirementsFor(await this.evidenceRequirements(), caseRow);

    return {
      ...(await this.withFlowState(caseRow)),
      evidenceRequirements: requirements,
      completeness: requirements.length
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
    const flow = await this.flows.forCase(caseRow);
    const step = getStep(flow, dto.stepId);
    if (!step) throw new BadRequestException(`Unknown step: ${dto.stepId}`);

    const result = validateAnswer(step, dto.value, {
      answers: caseRow.answers as CaseAnswers,
      travelClaimType: flow.travelClaimType,
    });
    if (!result.valid) {
      return { accepted: false, error: result.error, step };
    }

    const answers = { ...(caseRow.answers as CaseAnswers), [dto.stepId]: dto.value };
    const promoted = await this.promoteAnswers(answers, dto.stepId);
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

    // Editing a branch input rewrites the path retroactively. A claimant who
    // switches a cancellation reason from illness to a natural disaster leaves
    // a medical report attached to a claim that no longer asks for one, and an
    // adjuster reading the file sees evidence contradicting the claim.
    //
    // Retired, never deleted: what the claimant submitted and when is the
    // record PD 12.8 exists to keep. Superseding drops it out of the live
    // reads — the checklist, the claim conversion — while leaving it in the
    // file with its own history intact.
    if (branchInputSteps(flow).has(dto.stepId)) {
      await this.retireOffPathDocuments(id, flow, answers);
    }

    return {
      accepted: true,
      case: await this.withFlowState(updated),
      nextStep: nextStepId ? getStep(flow, nextStepId) : null,
      warnings,
    };
  }

  /**
   * A staff correction to one intake answer. MASTER_PLAN §6 item 21.
   *
   * Not `patchAnswer` with a role check, because a correction is not a turn.
   * Three things differ, each load-bearing:
   *
   *  - **It is audited.** The claimant's own turns leave a transcript, so
   *    their edits are attributable without a second record. A staff edit has
   *    no transcript — an unaudited one would be an anonymous change to a
   *    claimant's statement, which is the thing the evidential audit exists
   *    to make impossible.
   *  - **The cursor does not move.** `patchAnswer` advances `currentStepId`
   *    because a turn answers the open question; a correction to step 3 of an
   *    eighteen-step conversation must not send the claimant back to step 4.
   *  - **Sensitive steps are refused.** The bank account number is masked in
   *    `answers` and its plaintext lives behind the audited reveal; an inline
   *    correction would end-run that gate.
   *
   * Same status gate as every other edit (`getEditableCase`): once a case is
   * in vetting, the claimant's statements are frozen for staff exactly as
   * they are for the claimant.
   */
  async correctAnswer(id: string, dto: PatchAnswerDto, tenantContext: TenantContext) {
    if (tenantContext.userRole === 'CLAIMANT') {
      // Claimants amend through the conversation, where the flow re-validates
      // and the transcript records it — not through the correction door.
      throw new ForbiddenException('Not permitted');
    }
    const caseRow = await this.getEditableCase(id, tenantContext);
    const flow = await this.flows.forCase(caseRow);
    const step = getStep(flow, dto.stepId);
    if (!step) throw new BadRequestException(`Unknown step: ${dto.stepId}`);
    if (SENSITIVE_ANSWER_STEPS.has(dto.stepId)) {
      throw new BadRequestException(
        'Payout details are corrected through their own gated path, not here.'
      );
    }
    if (step.answerType === 'document' || step.isReview) {
      throw new BadRequestException('This step is not a typed answer.');
    }

    const previousAnswers = caseRow.answers as CaseAnswers;
    const result = validateAnswer(step, dto.value, {
      answers: previousAnswers,
      travelClaimType: flow.travelClaimType,
    });
    if (!result.valid) {
      return { accepted: false, error: result.error, step };
    }

    const answers = { ...previousAnswers, [dto.stepId]: dto.value };
    const promoted = await this.promoteAnswers(answers, dto.stepId);

    const updated = await this.prisma.case.update({
      where: { id },
      data: {
        answers: this.redactSensitiveAnswers(answers) as Prisma.InputJsonValue,
        ...promoted,
      },
      include: { policy: true },
    });

    // Same retirement rule as the claimant's own edit: a corrected branch
    // input must not leave contradictory evidence on the live checklist.
    if (branchInputSteps(flow).has(dto.stepId)) {
      await this.retireOffPathDocuments(id, flow, answers);
    }

    // The attribution the whole endpoint exists for: who changed which
    // statement, from what, to what.
    await this.audit(id, 'CASE_ANSWER_CORRECTED', tenantContext, {
      oldValues: { [dto.stepId]: previousAnswers[dto.stepId] ?? null },
      newValues: { [dto.stepId]: dto.value },
      metadata: { stepId: dto.stepId, stepLabel: step.label },
    });

    return { accepted: true, case: await this.withFlowState(updated), step };
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
    // Resolved rather than trusted: Telegram's file download returns an
    // unhelpful content-type, so every upload from that channel was stored as
    // application/octet-stream — which serves back as a download prompt
    // instead of the photo an operator is trying to look at.
    const mimeType = resolveMimeType(file.filename, file.mimetype);
    const storagePath = await this.storageService.uploadFile(
      buffer,
      file.filename,
      mimeType,
      `cases/${id}`
    );

    // A claimant re-sending a document means the first one was wrong. Retire it
    // rather than leaving two attached to the same requirement, which would
    // leave an adjuster guessing which one the claimant meant.
    if (stepId) {
      const superseded = await this.prisma.caseDocument.updateMany({
        where: { caseId: caseRow.id, stepId, supersededAt: null },
        data: { supersededAt: new Date() },
      });
      if (superseded.count > 0) {
        this.logger.log(
          `Case ${caseRow.id}: ${superseded.count} document(s) superseded at step ${stepId}.`
        );
      }
    }

    const document = await this.prisma.caseDocument.create({
      data: {
        caseId: caseRow.id,
        tenantId: caseRow.tenantId,
        documentType,
        fileName: file.filename,
        storagePath,
        mimeType,
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

  /**
   * The evidence attached to a case, as an operator needs to see it.
   *
   * Superseded documents are included and marked rather than filtered out:
   * what the claimant sent and when is part of the record (PD 12.8), and an
   * operator looking at a re-upload should be able to see what it replaced.
   * The checklist filters to live rows; this is the file, not the checklist.
   */
  async listDocuments(id: string, tenantContext: TenantContext) {
    const caseRow = await this.findOne(id, tenantContext);

    const documents = await this.prisma.caseDocument.findMany({
      where: { caseId: caseRow.id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        documentType: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        stepId: true,
        validationStatus: true,
        createdAt: true,
        supersededAt: true,
      },
    });

    return documents.map(document => {
      // Stored types are corrected on read as well as on write: the rows
      // written before the capture fix carry octet-stream, and a backfill
      // cannot reach a file whose bytes were never wrong in the first place.
      const mimeType = resolveMimeType(document.fileName, document.mimeType);
      return { ...document, mimeType, inlineRenderable: isInlineRenderable(mimeType) };
    });
  }

  /**
   * One document's bytes, for an operator who has to look at the evidence.
   *
   * Streamed through the service rather than handed out as a storage URL: the
   * local filesystem driver has no signing, and a URL that outlives the check
   * that authorised it is a URL that can be forwarded. Every fetch therefore
   * passes tenant scoping, and the gateway records it as a sensitive read —
   * PDPA asks who *accessed* personal data, not only who changed it.
   */
  async readDocument(id: string, documentId: string, tenantContext: TenantContext) {
    const caseRow = await this.findOne(id, tenantContext);

    const document = await this.prisma.caseDocument.findFirst({
      where: { id: documentId, caseId: caseRow.id },
    });
    // Scoped to the case, so a document id belonging to another case reads as
    // absent rather than forbidden — the same existence-check reasoning the
    // rest of the service uses.
    if (!document) throw new NotFoundException('Document not found on this case');

    const buffer = await this.storageService.readFile(document.storagePath);
    const mimeType = resolveMimeType(document.fileName, document.mimeType);

    return {
      buffer,
      fileName: document.fileName,
      mimeType,
      inlineRenderable: isInlineRenderable(mimeType),
    };
  }

  /**
   * Supersede documents attached to steps this claimant's answers no longer
   * reach. Called only after a branch input changes, since nothing else can
   * move a step off the path.
   */
  private async retireOffPathDocuments(caseId: string, flow: CaseFlow, answers: CaseAnswers) {
    const onPath = pathSteps(flow, answers);

    const live = await this.prisma.caseDocument.findMany({
      where: { caseId, supersededAt: null, stepId: { not: null } },
      select: { id: true, stepId: true },
    });
    const stranded = live.filter(document => document.stepId && !onPath.has(document.stepId));
    if (stranded.length === 0) return;

    await this.prisma.caseDocument.updateMany({
      where: { id: { in: stranded.map(document => document.id) } },
      data: { supersededAt: new Date() },
    });
    this.logger.log(
      `Case ${caseId}: retired ${stranded.length} document(s) at steps the answers no longer reach ` +
        `(${stranded.map(document => document.stepId).join(', ')}).`
    );
  }

  async submit(id: string, tenantContext: TenantContext) {
    const caseRow = await this.getEditableCase(id, tenantContext);
    const flow = await this.flows.forCase(caseRow);
    const answers = caseRow.answers as CaseAnswers;

    // Every reachable mandatory step (documents included — their answers carry
    // the CaseDocument id). Shared with the conversation, which routes the
    // claimant to the first of these rather than letting them reach here.
    const missing = missingSteps(flow, answers).map(step => step.label);
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
    const updated = await this.transitionWithNote(
      id,
      CaseStatus.INFO_REQUESTED,
      note,
      tenantContext
    );

    // Until this existed, an operator could ask for a document and the claimant
    // was never told — the case simply stopped, and the SLA clock kept running
    // against the firm for a wait it had not communicated.
    //
    // No dedupeKey: each request is a distinct ask, and an operator returning a
    // case to the claimant twice means two different things were needed.
    const claimant = updated.claimantId
      ? await this.prisma.claimant.findUnique({
          where: { id: updated.claimantId },
          select: { email: true, fullName: true },
        })
      : null;

    await this.notifications.enqueue({
      tenantId: updated.tenantId,
      template: 'case.information-requested',
      recipient: claimant?.email,
      entityType: 'CASE',
      entityId: updated.id,
      message: render('case.information-requested', {
        caseNumber: updated.caseNumber,
        request: note,
        claimantName: claimant?.fullName ?? undefined,
      }),
    });

    return updated;
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

    /**
     * A tail with no account behind it means the value was captured and then
     * lost — not that the claimant never gave one. The two look identical as a
     * blank field and call for opposite actions: one needs the claimant asked
     * again, the other needs nothing.
     *
     * Derived rather than stored, because the combination *is* the fact: a
     * `last4` exists only if an account was once promoted, and a null
     * ciphertext beside it can only mean the account is gone.
     *
     * Five cases are in this state on the demo book, from the defect fixed in
     * `ecd342a` — `patchAnswer` re-encrypted the display mask over the real
     * ciphertext on the turn after capture. Their plaintext is unrecoverable
     * by design: it lived solely in the column that was overwritten.
     */
    const lost = accountNumber === null && caseRow.bankAccountLast4 !== null;

    await this.audit(id, 'PAYOUT_DETAILS_REVEALED', tenantContext, {
      metadata: {
        reason: 'operator requested payout details',
        last4: caseRow.bankAccountLast4,
        // Recorded so the trail distinguishes a reveal that returned something
        // from one that could not. An examiner asking "who saw this account"
        // should not be shown a row where nobody could have.
        ...(lost ? { outcome: 'unrecoverable' } : {}),
      },
    });

    return {
      bankName: caseRow.bankName,
      bankAccountHolderName: caseRow.bankAccountHolderName,
      bankAccountNumber: accountNumber,
      unrecoverable: lost,
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

    const documents = await this.prisma.caseDocument.findMany({
      where: { caseId: id, supersededAt: null },
    });

    const converted = await this.prisma.$transaction(async tx => {
      // Record the claimant's own name, which until now no channel captured:
      // a messaging claimant is created from a verified phone number alone, so
      // the row sat nameless and the only name on the claim was whoever the
      // payout account belongs to — not necessarily the same person.
      //
      // Only ever filled in, never overwritten. A claimant who already has a
      // name from eKYC or a staff-entered record has a better-verified one than
      // free text typed into a chat, and a second claim must not downgrade it.
      const claimantName = this.answerString(answers['claimant-name']);
      if (claimantName && caseRow.claimantId) {
        await tx.claimant.updateMany({
          where: { id: caseRow.claimantId, fullName: null },
          data: { fullName: claimantName },
        });
      }

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
    // A conversationally-intaken claim can arrive with its mandatory evidence
    // already collected — the bot checked the list before it allowed review.
    // The CSP final-report window runs from *complete documents* (para 10.13),
    // so the anchor must be evaluated the moment the copied set exists, not
    // left to the next upload or the REPORT_PENDING proxy. Same method the
    // upload path calls, so the checklist logic cannot drift into two copies.
    if (converted.convertedClaimId) {
      await this.claims.refreshDocumentsComplete(converted.convertedClaimId);
    }
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

  /**
   * Public so a caller that has loaded a Case by another route can apply the
   * *same* check before disclosing any of it, rather than writing a second
   * one that drifts. The conversation gateway loads a Case by the id on the
   * binding and needs exactly this.
   */
  assertAccess(
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
  private async promoteAnswers(
    answers: CaseAnswers,
    /** The step this turn answered, where there is one. Omitted on create. */
    changedStepId?: string
  ): Promise<Partial<Prisma.CaseUncheckedCreateInput>> {
    const promoted: Partial<Prisma.CaseUncheckedCreateInput> = {};

    // Only when the policy number is the answer that just changed, or when it
    // has never been resolved. This ran a cross-tenant Policy lookup on every
    // single turn of every conversation — eighteen queries to answer a
    // question asked once, and the same answer each time.
    const policyNumber = this.answerString(answers['policy-number']);
    const policySettled = changedStepId !== undefined && changedStepId !== 'policy-number';
    if (policyNumber !== undefined && !policySettled) {
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
    // Only on the turn that supplies it. A masked value means we are looking at
    // the stored bag on a later turn, and encrypting that would overwrite the
    // real account number with its own display mask — invisibly, because
    // `lastDigits` strips the bullets and every screen still reads correctly.
    // Leaving the field unset here leaves the existing ciphertext untouched,
    // which is the whole point.
    if (bankAccount !== undefined && !isMaskedAnswer(bankAccount)) {
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

  /**
   * The platform's evidence checklists, every line.
   *
   * Was travel-only, so a fire or burglary case showed no document progress at
   * all — the operator vetting it had nothing to vet against, and the column
   * read as "no requirement" rather than "not checked".
   */
  private async evidenceRequirements() {
    return this.prisma.evidenceRequirement.findMany({
      where: { tenantId: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /**
   * The rows that apply to one case: its category, and either its travel
   * subtype or the category-generic rows for lines that have no subtype.
   */
  private requirementsFor<
    R extends { category: ClaimCategory; travelClaimType: TravelClaimType | null },
  >(requirements: R[], caseRow: { category: ClaimCategory; travelClaimType: TravelClaimType | null }): R[] {
    return requirements.filter(
      req =>
        req.category === caseRow.category &&
        (req.travelClaimType === caseRow.travelClaimType || req.travelClaimType === null)
    );
  }

  /**
   * Attach the current flow step definition so channels can resume.
   *
   * Resolved from the Case's pinned flow rather than the built-in one: after an
   * edit is published, those differ, and the step a claimant is looking at must
   * come from the flow they started.
   */
  private async withFlowState<
    T extends {
      travelClaimType: TravelClaimType | null;
      currentStepId: string | null;
      flowDefinitionId: string | null;
    },
  >(caseRow: T) {
    if (!caseRow.travelClaimType) return { ...caseRow, currentStep: null };
    const flow = await this.flows.forCase(caseRow);
    const currentStep = caseRow.currentStepId ? getStep(flow, caseRow.currentStepId) : null;
    return { ...caseRow, currentStep: currentStep ?? null };
  }

  /**
   * The whole flow a Case is walking — its pinned version.
   *
   * A separate call rather than a field on every case payload. The claimant app
   * needs all the steps once, to rebuild the transcript and know what comes
   * next; the list and per-answer responses do not, and embedding eighteen step
   * definitions in each of them would cost far more than the extra request.
   */
  async getFlowForCase(id: string, tenantContext: TenantContext): Promise<CaseFlow> {
    const caseRow = await this.findOne(id, tenantContext);
    return this.flows.forCase(caseRow);
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



