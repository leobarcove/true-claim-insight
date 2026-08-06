import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimDto } from './dto/update-claim.dto';
import { ClaimQueryDto } from './dto/claim-query.dto';
import { DocumentStatus } from '@tci/shared-types';
import { ClaimCategory, ClaimStatus, ConsentPurpose, SlaStage } from '@prisma/client';
import { EncryptionService } from '@tci/crypto';
import { SlaService } from '../sla/sla.service';
import { SLA_TRANSITIONS } from '../sla/sla-transitions';
import { CLAIM_STATUS_TRANSITIONS } from './claim-transitions';
import { assignmentEligibility } from '../adjusters/adjuster-competency';
import { screeningStanding } from '../adjusters/background-screening';
import { rotationAdvisory } from '../adjusters/rotation';
import { conflictRefusalReason, screenConflicts } from '../adjusters/conflict-screening';
import { checkAuthority, type AuthorityDecision } from './claim-authority';
import { AuditService } from '../common/audit/audit.service';
import { ConsentService } from '../consent/consent.service';
import { isLicensedMode } from '../tenant/tenant-settings';

@Injectable()
export class ClaimsService {
  private readonly logger = new Logger(ClaimsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantService: TenantService,
    private readonly encryption: EncryptionService,
    private readonly sla: SlaService,
    private readonly consent: ConsentService,
    private readonly audit: AuditService
  ) {}

  /**
   * Real consent standing for a claim, for display and for gating.
   *
   * Replaces the `isPdpaCompliant` boolean, which the client set and nothing
   * verified — a claimant ticking a box in a browser is not evidence that a
   * lawful basis exists. This reads the actual consent records instead, so the
   * portal badge reports what is true rather than what was asserted.
   */
  private async consentStanding(claimantId: string | null | undefined) {
    if (!claimantId) return { claimProcessing: false, biometric: false, crossBorder: false };

    const [claimProcessing, biometric, crossBorder] = await Promise.all([
      this.consent.hasConsent(claimantId, ConsentPurpose.CLAIM_PROCESSING),
      this.consent.hasConsent(claimantId, ConsentPurpose.BIOMETRIC_ANALYSIS),
      this.consent.hasConsent(claimantId, ConsentPurpose.CROSS_BORDER_TRANSFER),
    ]);
    return { claimProcessing, biometric, crossBorder };
  }

  private async isLicensedMode(tenantId: string | null | undefined): Promise<boolean> {
    if (!tenantId) return false;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    return isLicensedMode(tenant?.settings);
  }

  /**
   * Refuse a transition the actor is not authorised to make.
   *
   * Returns the decision so its basis can be written onto the audit row: an
   * examiner asking why a particular person was allowed to approve a particular
   * amount gets an answer from the record rather than from reasoning about
   * configuration as it stands today.
   */
  private async assertAuthority(
    claim: { id: string; adjusterId?: string | null; category?: string | null; tenantId?: string | null; approvedAmount?: unknown; estimatedLossAmount?: unknown },
    targetStatus: ClaimStatus,
    tenantContext?: TenantContext
  ): Promise<AuthorityDecision> {
    if (!tenantContext) {
      // No identity, no authority. Internal callers must supply a context.
      return { allowed: true, basis: 'no tenant context (internal call)' };
    }

    const [actorAdjuster, limits] = await Promise.all([
      this.prisma.adjuster.findFirst({ where: { userId: tenantContext.userId } }),
      this.prisma.authorityLimit.findMany({
        where: { tenantId: tenantContext.tenantId, isActive: true },
      }),
    ]);

    const toNumber = (value: unknown): number | null =>
      value === null || value === undefined ? null : Number(value);

    const decision = checkAuthority({
      targetStatus,
      actorRole: tenantContext.userRole,
      actorAdjusterId: actorAdjuster?.id ?? null,
      claimAdjusterId: claim.adjusterId ?? null,
      claimCategory: claim.category ?? null,
      amount: toNumber(claim.approvedAmount) ?? toNumber(claim.estimatedLossAmount),
      limits: limits.map(limit => ({
        role: limit.role,
        adjusterId: limit.adjusterId,
        category: limit.category,
        maxApprovalAmount: limit.maxApprovalAmount === null ? null : Number(limit.maxApprovalAmount),
        canApproveOwnAssessment: limit.canApproveOwnAssessment,
      })),
    });

    if (!decision.allowed) {
      this.logger.warn(
        `Authority refused: user ${tenantContext.userId} (${tenantContext.userRole}) ` +
          `→ ${targetStatus} on claim ${claim.id}: ${decision.basis}`
      );
      throw new ForbiddenException(decision.reason);
    }

    return decision;
  }

  /**
   * Reopen a closed claim for a supplementary claim (CSP: 5 working days).
   *
   * The one legal exit from CLOSED, and a deliberate act rather than a status
   * edit: it starts the SUPPLEMENTARY_CLAIM clock, so the five-working-day
   * response obligation is measured from the moment the supplementary arrived.
   * Retention note: reopening does not disturb `closedAt` history — the clock
   * anchor becomes the *new* closure when the claim closes again.
   */
  async reopenSupplementary(id: string, reason: string, tenantContext: TenantContext) {
    if (!reason?.trim()) {
      throw new BadRequestException('The supplementary claim must be described.');
    }
    const claim = await this.prisma.claim.findUnique({ where: { id } });
    if (!claim) throw new NotFoundException('Claim not found');
    if (claim.status !== 'CLOSED') {
      throw new BadRequestException(
        `Only a CLOSED claim can take a supplementary claim; this one is ${claim.status}.`
      );
    }
    if (claim.legalHoldAt) {
      // A held claim can still be reopened — the hold protects records, not work.
      this.logger.log(`Reopening claim ${id} under legal hold; records remain protected`);
    }

    await this.prisma.claim.update({
      where: { id },
      data: { status: 'IN_ASSESSMENT', closedAt: null, updatedAt: new Date() },
    });

    await this.sla.startQuietly(id, SlaStage.SUPPLEMENTARY_CLAIM, claim.tenantId);

    await this.createAuditTrail(
      id,
      'SUPPLEMENTARY_REOPENED',
      { reason },
      tenantContext,
      { oldValues: { status: 'CLOSED' }, newValues: { status: 'IN_ASSESSMENT' } }
    );

    this.logger.log(`Claim ${claim.claimNumber} reopened for a supplementary claim`);
    return this.findOne(id, tenantContext);
  }

  /**
   * Start, pause, resume and stop the SLA clocks a status change implies.
   *
   * The mapping lives in SLA_TRANSITIONS so it is reviewable as a whole. Every
   * call is fail-soft: a clock that cannot be written is logged, never raised,
   * because refusing a legitimate claim transition over a missing deadline row
   * would be the worse failure.
   */
  private async applySlaTransition(
    claimId: string,
    status: ClaimStatus,
    tenantId?: string | null
  ): Promise<void> {
    const transition = SLA_TRANSITIONS[status];
    if (!transition) return;

    for (const stage of transition.start ?? []) {
      await this.sla.startQuietly(claimId, stage, tenantId);
    }
    for (const { stage, reason } of transition.pause ?? []) {
      await this.sla.runQuietly(`pause ${stage} on ${claimId}`, () =>
        this.sla.pause(claimId, stage, reason)
      );
    }
    for (const stage of transition.resume ?? []) {
      await this.sla.runQuietly(`resume ${stage} on ${claimId}`, () =>
        this.sla.resume(claimId, stage)
      );
    }
    for (const stage of transition.stop ?? []) {
      await this.sla.runQuietly(`stop ${stage} on ${claimId}`, () =>
        this.sla.stop(claimId, stage)
      );
    }
  }

  /**
   * Create a new claim
   */
  async create(createClaimDto: CreateClaimDto, tenantContext: TenantContext) {
    const claimNumber = await this.generateClaimNumber();

    const claim = await this.prisma.claim.create({
      data: {
        claimNumber,
        policyNumber: createClaimDto.policyNumber || '',
        claimType: createClaimDto.claimType as any,
        incidentDate: new Date(createClaimDto.incidentDate),
        incidentLocation: createClaimDto.incidentLocation as any,
        description: createClaimDto.description,
        claimantId: createClaimDto.claimantId,
        ...(await this.encryptedNric(createClaimDto.nric)),
        insurerTenantId: tenantContext.tenantId,
        tenantId: tenantContext.tenantId, // Standardized field
        userId: tenantContext?.userRole === 'CLAIMANT' ? null : tenantContext.userId, // Standardized field
        vehiclePlateNumber: createClaimDto.vehiclePlateNumber,
        vehicleMake: createClaimDto.vehicleMake,
        vehicleModel: createClaimDto.vehicleModel,
        vehicleChassisNumber: createClaimDto.vehicleChassisNumber,
        vehicleEngineNumber: createClaimDto.vehicleEngineNumber,
        vehicleYear: createClaimDto.vehicleYear ? Number(createClaimDto.vehicleYear) : null,
        policeReportNumber: createClaimDto.policeReportNumber,
        policeStation: createClaimDto.policeStation,
        policeReportDate: createClaimDto.policeReportDate
          ? new Date(createClaimDto.policeReportDate)
          : null,
        createdById: tenantContext?.userRole === 'CLAIMANT' ? null : tenantContext?.userId,
        updatedById: tenantContext?.userRole === 'CLAIMANT' ? null : tenantContext?.userId,
      },
      include: {
        claimant: {
          select: {
            id: true,
            fullName: true,
            phoneNumber: true,
          },
        },
      },
    });

    // Log audit trail
    await this.createAuditTrail(
      claim.id,
      'CLAIM_CREATED',
      {
        claimNumber,
        claimType: createClaimDto.claimType,
      },
      tenantContext
    );

    this.logger.log(`Claim created: ${claimNumber}`);

    return claim;
  }

  /**
   * Find all claims with pagination and filters
   * Now with mandatory tenant isolation
   */
  async findAll(query: ClaimQueryDto, tenantContext?: TenantContext) {
    const {
      page = 1,
      limit = 20,
      status,
      claimType,
      adjusterId,
      claimantId,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      scheduledFrom,
      createdById,
    } = query;
    const skip = (page - 1) * limit;

    // Build base where clause
    let where: any = {};
    if (status) {
      if (status === 'SCHEDULED') {
        where.status = { in: ['SCHEDULED', 'IN_ASSESSMENT'] };
      } else {
        where.status = status;
      }
    }
    if (claimType) where.claimType = claimType;
    if (adjusterId) where.adjusterId = adjusterId;
    if (claimantId) where.claimantId = claimantId;
    if (createdById) where.createdById = createdById;
    if (scheduledFrom) {
      where.scheduledAssessmentTime = {
        gte: new Date(scheduledFrom),
      };
    }

    if (query.hasAnalysis) {
      where.AND = [
        {
          documents: {
            some: {
              analysis: { isNot: null },
            },
          },
        },
      ];
    }

    // Apply tenant isolation filter
    if (tenantContext) {
      where = this.tenantService.buildClaimTenantFilter(tenantContext, where);
    }

    // Apply search filter (must be after tenant filter to combine properly)
    if (search) {
      const searchConditions = [
        { claimNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { claimant: { fullName: { contains: search, mode: 'insensitive' } } },
      ];

      // Combine search with existing filters
      if (where.OR) {
        // If filter already has OR, wrap everything in AND
        const { OR: existingOR, ...rest } = where;
        where = {
          ...rest,
          AND: [...(rest.AND || []), { OR: existingOR }, { OR: searchConditions }],
        };
      } else {
        where.OR = searchConditions;
      }
    }

    // Build orderBy from sortBy and sortOrder
    const orderBy: Record<string, 'asc' | 'desc'> = { [sortBy]: sortOrder };

    const [claims, total] = await Promise.all([
      this.prisma.claim.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          claimant: {
            select: {
              id: true,
              fullName: true,
              phoneNumber: true,
            },
          },
          adjuster: {
            select: {
              id: true,
              user: {
                select: {
                  fullName: true,
                  email: true,
                },
              },
            },
          },
          _count: {
            select: {
              documents: true,
              sessions: true,
              notes: true,
            },
          },
          documents: {
            select: {
              id: true,
              type: true,
              filename: true,
              createdAt: true,
            },
          },
          trinityChecks: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              score: true,
              status: true,
              riskFactors: true,
            },
          },
          /* The subtype is what an adjuster scans a travel book by — a trip
             cancellation and a medical expense claim need different evidence
             and different reserves. `Claim.claimType` is motor-only, so
             without this the list column has nothing to show. */
          travelClaim: { select: { travelClaimType: true } },
        },
      }),
      this.prisma.claim.count({ where }),
    ]);

    const redactedClaims = claims.map(c =>
      this.tenantService.redactClaim(c, tenantContext as TenantContext)
    );

    return {
      claims: redactedClaims,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Find a single claim by ID with tenant validation
   */
  async findOne(id: string, tenantContext?: TenantContext) {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: {
        claimant: true,
        adjuster: {
          include: {
            user: { select: { fullName: true, email: true } },
            tenant: { select: { id: true, name: true } },
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        sessions: {
          orderBy: { createdAt: 'desc' },
          include: {
            riskAssessments: true,
            deceptionScores: {
              orderBy: { createdAt: 'desc' },
            },
            clientInfos: true,
          },
        },
        trinityChecks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        notes: {
          orderBy: { createdAt: 'desc' },
        },
        // Non-motor polymorphic sub-tables. floodClaim is null for non-flood
        // categories; the UI checks `claim.category` to decide which panel
        // to render. Add fire/lightning/burglary includes as those tables land.
        floodClaim: true,
        fraudSignals: {
          orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        },
      } as any,
    });

    if (!claim) {
      throw new NotFoundException(`Claim with ID ${id} not found`);
    }

    // Validate tenant access if context provided
    if (tenantContext) {
      await this.tenantService.validateClaimAccess(id, tenantContext);
    }

    // Transform sessions to include persisted deception data instead of raw assessments
    const sessions = (claim as any).sessions.map((session: any) => {
      const { deceptionScores, riskAssessments, ...sessionData } = session as any;
      const latestScore = deceptionScores?.[0];

      return {
        ...sessionData,
        summary: latestScore
          ? {
              deceptionScore: Number(latestScore.deceptionScore),
              isHighRisk: Number(latestScore.deceptionScore) > 0.7,
              breakdown: {
                voiceStress: Number(latestScore.voiceStress),
                visualBehavior: Number(latestScore.visualBehavior),
                expressionMeasurement: Number(latestScore.expressionMeasurement),
              },
            }
          : {
              deceptionScore: 0,
              isHighRisk: false,
              breakdown: { voiceStress: 0, visualBehavior: 0, expressionMeasurement: 0 },
            },
        // Provide the timeline of deception scores directly
        deceptionData: (deceptionScores || []).map((ds: any) => ({
          id: ds.id,
          deception: Number(ds.deceptionScore) * 100,
          voice: Number(ds.voiceStress) * 100,
          visual: Number(ds.visualBehavior) * 100,
          expression: Number(ds.expressionMeasurement) * 100,
          createdAt: ds.createdAt,
        })),
        // Keep risk assessments for detail views
        riskAssessments: (riskAssessments || []).sort(
          (a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
      };
    });

    const result = {
      ...claim,
      sessions,
      // Real consent standing, read from the consent records rather than the
      // self-declared `isPdpaCompliant` flag the client used to set.
      consent: await this.consentStanding(claim.claimantId),
    };

    return tenantContext ? this.tenantService.redactClaim(result, tenantContext) : result;
  }

  /**
   * Update a claim with tenant validation
   */
  async update(id: string, updateClaimDto: UpdateClaimDto, tenantContext?: TenantContext) {
    const existingClaim = await this.findOne(id, tenantContext);

    // Unredacted pre-image, captured BEFORE the write so the audit trail records
    // true previous values (findOne's result is redacted by role).
    const preImage = await this.prisma.claim.findUnique({ where: { id } });

    // RESTRICTION: Non-admins cannot edit APPROVED or CLOSED claims
    const isFinalStatus = ['APPROVED', 'REJECTED', 'CLOSED'].includes(existingClaim.status);
    const hasAdminPrivilege =
      tenantContext?.userRole === 'FIRM_ADMIN' || tenantContext?.userRole === 'SUPER_ADMIN';

    if (isFinalStatus && !hasAdminPrivilege) {
      throw new BadRequestException(
        `Claims in status ${existingClaim.status} cannot be edited by the current user role`
      );
    }

    await this.prisma.claim.update({
      where: { id },
      data: {
        ...(updateClaimDto.description && {
          description: updateClaimDto.description,
        }),
        ...(updateClaimDto.incidentLocation && {
          incidentLocation: updateClaimDto.incidentLocation as any,
        }),
        vehiclePlateNumber: updateClaimDto.vehiclePlateNumber,
        vehicleMake: updateClaimDto.vehicleMake,
        vehicleModel: updateClaimDto.vehicleModel,
        policeReportNumber: updateClaimDto.policeReportNumber,
        policeStation: updateClaimDto.policeStation,
        policeReportDate: updateClaimDto.policeReportDate
          ? new Date(updateClaimDto.policeReportDate)
          : undefined,
        workshopName: updateClaimDto.workshopName,
        estimatedRepairCost: updateClaimDto.estimatedRepairCost,
        slaDeadline: updateClaimDto.slaDeadline ? new Date(updateClaimDto.slaDeadline) : undefined,
        updatedById: tenantContext?.userId,
        updatedAt: new Date(),
      },
      include: {
        claimant: {
          select: {
            id: true,
            fullName: true,
          },
        },
        adjuster: {
          select: {
            id: true,
            user: { select: { fullName: true } },
          },
        },
      },
    });

    await this.createAuditTrail(
      id,
      'CLAIM_UPDATED',
      { fields: Object.keys(updateClaimDto) },
      tenantContext,
      this.diffFields(preImage ?? {}, updateClaimDto as Record<string, any>)
    );

    return this.findOne(id, tenantContext);
  }

  /**
   * Update claim status with tenant validation
   */
  async updateStatus(id: string, status: ClaimStatus, tenantContext?: TenantContext) {
    const existingClaim = await this.findOne(id, tenantContext);

    // Validate status transition
    this.validateStatusTransition(existingClaim.status, status);

    // Segregation of duties and monetary authority (§4.3 A3). Enforced here
    // rather than in the controller: a role decorator cannot know whether this
    // person assessed this claim, or what they are authorised to approve.
    const authority = await this.assertAuthority(existingClaim, status as ClaimStatus, tenantContext);

    // §3.6 #8: the checklist finally gates. Moving to REPORT_PENDING with
    // mandatory evidence missing blocks in registered mode and is recorded as
    // an advisory as a TPA — the same licence-flip shape as the people gates.
    if (status === 'REPORT_PENDING') {
      const complete = await this.refreshDocumentsComplete(id);
      if (!complete) {
        if (await this.isLicensedMode(existingClaim.tenantId)) {
          throw new BadRequestException(
            'Mandatory evidence is incomplete; the report stage cannot begin without it ' +
              '(the CSP final-report window runs from complete documents).'
          );
        }
        this.logger.warn(`Claim ${id} moved to REPORT_PENDING with incomplete mandatory evidence (advisory while TPA)`);
      }
    }

    await this.prisma.claim.update({
      where: { id },
      data: {
        status: status as any,
        // Closure anchors the PD 12.8 retention period; nothing belonging to
        // this claim may be purged before closedAt + the retention years.
        ...(status === 'CLOSED' ? { closedAt: new Date() } : {}),
        updatedAt: new Date(),
      },
    });

    await this.createAuditTrail(
      id,
      'STATUS_CHANGED',
      {
        from: existingClaim.status,
        to: status,
        // Recorded whether or not it was contested, so an approval never has to
        // be reconstructed from who happened to be logged in at the time.
        authorityBasis: authority.basis,
      },
      tenantContext,
      { oldValues: { status: existingClaim.status }, newValues: { status } }
    );

    // SLA clocks follow the status. Fail-soft on purpose: a deadline that could
    // not be recorded must not block an adjuster from progressing the claim, and
    // the gap is visible in the claim's SLA history.
    await this.applySlaTransition(id, status as ClaimStatus, existingClaim.tenantId);

    this.logger.log(
      `Claim ${existingClaim.claimNumber} status: ${existingClaim.status} -> ${status}`
    );

    return this.findOne(id, tenantContext);
  }

  /**
   * Assign an adjuster to a claim with tenant validation
   * Ensures adjuster belongs to the same tenant as the user
   */
  async assignAdjuster(claimId: string, adjusterId: string, tenantContext?: TenantContext) {
    const claim = await this.findOne(claimId, tenantContext);

    // Verify adjuster exists
    const adjuster = await this.prisma.adjuster.findUnique({
      where: { id: adjusterId },
      include: { user: true },
    });

    if (!adjuster) {
      throw new NotFoundException(`Adjuster with ID ${adjusterId} not found`);
    }

    // Validate adjuster belongs to the same tenant
    if (tenantContext) {
      this.tenantService.validateTenantAccess(adjuster.tenantId, tenantContext, 'Adjuster');
    }

    // PD 12.1 / 12.2(b): a suspended adjuster is refused in every mode; licence
    // verification and category competency block once registered and are
    // recorded advisories while a TPA — the licence flip, applied to people.
    const competency = claim.category
      ? await this.prisma.adjusterCompetency.findUnique({
          where: { adjusterId_category: { adjusterId, category: claim.category } },
        })
      : null;
    const licensedMode = await this.isLicensedMode(claim.tenantId);
    const screenings = await this.prisma.backgroundScreening.findMany({
      where: { adjusterId },
    });
    const eligibility = assignmentEligibility({
      adjusterStatus: adjuster.status,
      licenseVerifiedAt: adjuster.licenseVerifiedAt,
      competency,
      screeningComplete: screeningStanding(screenings, adjuster.adjustingSince).complete,
      employmentType: adjuster.employmentType,
      licensedMode,
    });
    if (!eligibility.allowed) {
      throw new BadRequestException(eligibility.reason);
    }
    // PD 11.2(b): rotation is monitored, never blocked — a hard rule would
    // regularly force the less qualified adjuster onto a claim.
    if (claim.insurerTenantId) {
      const recent = await this.prisma.claim.findMany({
        where: { insurerTenantId: claim.insurerTenantId, adjusterId: { not: null }, id: { not: claimId } },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        select: { adjusterId: true },
      });
      const rotation = rotationAdvisory(recent.map(c => c.adjusterId), adjusterId);
      if (rotation) eligibility.advisories.push(rotation);
    }

    if (eligibility.advisories.length) {
      this.logger.warn(
        `Assignment advisories for adjuster ${adjusterId} on claim ${claimId}: ` +
          eligibility.advisories.join('; ')
      );
    }

    // PD 10.3 / 12.1(d): screen the standing declarations against this claim's
    // parties. A matched, unresolved conflict blocks in EVERY mode — this is a
    // conflict the firm has on record, and assigning through it is a choice
    // 12.1(d) does not offer. The screen result is audited either way, so
    // "clear" is distinguishable from "never screened".
    const declarations = await this.prisma.conflictDeclaration.findMany({
      where: { adjusterId, resolvedAt: null },
    });
    const screening = screenConflicts(declarations, {
      insurerTenantId: claim.insurerTenantId ?? null,
      workshopName: claim.workshopName ?? null,
    });
    if (!screening.clear) {
      this.logger.warn(
        `COI block: adjuster ${adjusterId} on claim ${claimId} — ` +
          screening.matches.map(m => m.partyName).join(', ')
      );
      throw new BadRequestException(conflictRefusalReason(screening.matches));
    }

    const updatedClaim = await this.prisma.claim.update({
      where: { id: claimId },
      data: {
        adjusterId,
        status: 'ASSIGNED',
        updatedAt: new Date(),
      },
      include: {
        adjuster: {
          select: {
            id: true,
            user: {
              select: {
                fullName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    await this.createAuditTrail(
      claimId,
      'ADJUSTER_ASSIGNED',
      {
        adjusterId,
        adjusterName: adjuster.user.fullName,
        // Advisories are part of the record: when registration turns these into
        // hard gates, the firm can show how long it operated clean before.
        ...(eligibility.advisories.length ? { eligibilityAdvisories: eligibility.advisories } : {}),
        coiScreen: { declarationsScreened: screening.screened, conflicts: 0 },
      },
      tenantContext,
      {
        oldValues: { adjusterId: claim.adjusterId ?? null, status: claim.status },
        newValues: { adjusterId, status: 'ASSIGNED' },
      }
    );

    // Assignment sets the claim to ASSIGNED directly rather than through
    // updateStatus, so the clocks for that status are applied here too.
    await this.applySlaTransition(claimId, ClaimStatus.ASSIGNED, claim.tenantId);

    this.logger.log(`Adjuster ${adjuster.user.fullName} assigned to claim ${claim.claimNumber}`);

    return updatedClaim;
  }

  /**
   * Soft delete a claim with tenant validation
   */
  async remove(id: string, tenantContext?: TenantContext) {
    const claim = await this.findOne(id, tenantContext);

    await this.prisma.claim.update({
      where: { id },
      data: {
        status: 'CLOSED',
        updatedAt: new Date(),
      },
    });

    await this.createAuditTrail(
      id,
      'CLAIM_CLOSED',
      {
        reason: 'Manually closed',
      },
      tenantContext
    );

    this.logger.log(`Claim ${claim.claimNumber} closed`);
  }

  /**
   * Return the evidence checklist for a claim: required document types for
   * the claim's category (from EvidenceRequirement config), each annotated
   * with whether the claimant has uploaded one yet.
   *
   * Resolution order for requirements (most specific wins for a documentType):
   *   1. Tenant-specific + subtype-specific
   *   2. Tenant-specific + subtype-generic (travelClaimType IS NULL)
   *   3. Global + subtype-specific
   *   4. Global + subtype-generic
   *
   * Subtype scoping matters for TRAVEL: each travel claim type has its own
   * checklist, so a flight-delay claim must not be asked for a Property
   * Irregularity Report. Rows with travelClaimType IS NULL apply to every
   * subtype of that category.
   */
  /**
   * Recompute evidence completeness and, on the transition to complete, set
   * `documentsCompleteAt` and start the FINAL_REPORT clock — CSP runs the
   * ten-working-day window from *complete documents*, and until this event
   * existed the clock could only anchor on REPORT_PENDING as a proxy.
   *
   * Set-once: a later upload does not move an anchor already set, and a
   * deletion does not unset it — the documents *were* complete, and the clock
   * that started from that fact stays honest.
   */
  async refreshDocumentsComplete(claimId: string): Promise<boolean> {
    const claim = await this.prisma.claim.findUnique({ where: { id: claimId } });
    if (!claim || claim.documentsCompleteAt) return Boolean(claim?.documentsCompleteAt);

    const checklist = await this.getEvidenceChecklist(claimId);
    const mandatory = checklist.filter(item => item.isMandatory);
    const complete = mandatory.length > 0 && mandatory.every(item => item.uploaded.length > 0);
    if (!complete) return false;

    const completeAt = new Date();
    await this.prisma.claim.update({
      where: { id: claimId },
      data: { documentsCompleteAt: completeAt },
    });
    await this.createAuditTrail(claimId, 'DOCUMENTS_COMPLETE', {
      mandatoryTypes: mandatory.map(item => item.documentType),
    });
    // The CSP anchor: idempotent, so REPORT_PENDING's later start is a no-op.
    await this.sla.startQuietly(claimId, SlaStage.FINAL_REPORT, claim.tenantId);
    this.logger.log(`Claim ${claim.claimNumber}: mandatory evidence complete; final-report clock anchored`);
    return true;
  }

  async getEvidenceChecklist(id: string, tenantContext?: TenantContext) {
    const claim = await this.findOne(id, tenantContext);

    // The travel subtype lives on the TravelClaim sub-table, not on Claim.
    const travelClaim =
      claim.category === ClaimCategory.TRAVEL
        ? await this.prisma.travelClaim.findUnique({
            where: { claimId: id },
            select: { travelClaimType: true },
          })
        : null;
    const subtype = travelClaim?.travelClaimType ?? null;

    // Match rows for this subtype plus the subtype-generic rows. For non-travel
    // categories only the generic rows exist, so this collapses to travelClaimType IS NULL.
    const subtypeFilter = subtype
      ? { OR: [{ travelClaimType: subtype }, { travelClaimType: null }] }
      : { travelClaimType: null };

    const [tenantReqs, globalReqs, uploadedDocs] = await Promise.all([
      claim.tenantId
        ? this.prisma.evidenceRequirement.findMany({
            where: { tenantId: claim.tenantId, category: claim.category, ...subtypeFilter },
            orderBy: { sortOrder: 'asc' },
          })
        : Promise.resolve([]),
      this.prisma.evidenceRequirement.findMany({
        where: { tenantId: null, category: claim.category, ...subtypeFilter },
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.document.findMany({
        where: { claimId: id },
        select: { id: true, type: true, filename: true, createdAt: true },
      }),
    ]);

    // Least specific first so the more specific row overwrites it.
    const bySpecificity = <T extends { travelClaimType: unknown }>(rows: T[]) => [
      ...rows.filter(r => r.travelClaimType === null),
      ...rows.filter(r => r.travelClaimType !== null),
    ];

    const byType = new Map<string, (typeof globalReqs)[number]>();
    for (const r of bySpecificity(globalReqs)) byType.set(r.documentType, r);
    for (const r of bySpecificity(tenantReqs)) byType.set(r.documentType, r); // tenant overrides global

    const uploadedByType = new Map<string, typeof uploadedDocs>();
    for (const d of uploadedDocs) {
      if (!uploadedByType.has(d.type)) uploadedByType.set(d.type, []);
      uploadedByType.get(d.type)!.push(d);
    }

    return Array.from(byType.values()).map(req => ({
      documentType: req.documentType,
      isMandatory: req.isMandatory,
      description: req.description,
      sortOrder: req.sortOrder,
      uploaded: uploadedByType.get(req.documentType) ?? [],
      satisfied: (uploadedByType.get(req.documentType)?.length ?? 0) > 0,
    }));
  }

  /**
   * Get claim timeline/audit trail with tenant validation
   */
  async getTimeline(id: string, tenantContext?: TenantContext) {
    await this.findOne(id, tenantContext);

    const auditTrail = await this.prisma.auditTrail.findMany({
      where: {
        entityId: id,
        entityType: 'CLAIM',
        ...(tenantContext?.tenantId && { tenantId: tenantContext.tenantId }),
      },
      orderBy: { createdAt: 'desc' },
    });

    return auditTrail;
  }

  /**
   * Tenant-wide operating figures for the dashboard.
   *
   * Every number here is dated by the event it claims to describe. The first
   * version dated completions by `updatedAt`, so editing a claim settled in
   * March counted it as completed this week — and a bulk data fix moved the
   * headline figure to 832 out of a 980-claim book. A turnaround number that
   * moves when nothing turned around is worse than no number.
   *
   * Cases, claims and sessions are counted separately and labelled as
   * themselves. They are different things at different stages of the funnel:
   * a case is intake the firm may still reject, a claim is the engagement, a
   * session is one appointment inside it.
   */
  async getStats(tenantContext: TenantContext, createdById?: string) {
    let where = this.tenantService.buildClaimTenantFilter(tenantContext);
    if (createdById) {
      where = { ...where, createdById };
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    // Month-to-date is only comparable with the same span of the month before.
    const sameDayLastMonth = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      now.getDate(),
      now.getHours(),
      now.getMinutes()
    );
    const startOfWeek = new Date(now.getTime() - now.getDay() * 24 * 60 * 60 * 1000);
    startOfWeek.setHours(0, 0, 0, 0);

    const [
      totalClaims,
      activeClaims,
      completedThisMonth,
      completedLastMonth,
      completedThisWeek,
      upcomingAssessments,
      totalAssigned,
      totalCases,
      statusBreakdown,
    ] = await Promise.all([
      // Total claims in tenant
      this.prisma.claim.count({ where }),

      // Active claims in tenant
      this.prisma.claim.count({
        where: {
          ...where,
          status: {
            in: ['ASSIGNED', 'SCHEDULED', 'IN_ASSESSMENT', 'REPORT_PENDING'],
          },
        },
      }),

      // Closed this month. `closedAt`, not `updatedAt` — the file closing is
      // the event, and it is also what PD 12.8 retention runs from.
      this.prisma.claim.count({ where: { ...where, closedAt: { gte: startOfMonth } } }),

      // Closed by this day of last month, for the change figure beside it.
      // Comparing six days against a whole month reported a 92% collapse in a
      // book that was performing normally — the sort of number that starts a
      // conversation about the wrong thing.
      this.prisma.claim.count({
        where: { ...where, closedAt: { gte: startOfLastMonth, lt: sameDayLastMonth } },
      }),

      // Closed this week.
      this.prisma.claim.count({ where: { ...where, closedAt: { gte: startOfWeek } } }),

      // The adjuster's diary: claims with an appointment still to come. Counted
      // the same way the panel beside it lists them, so the two cannot
      // disagree — the card used to say "19" while the list said "none".
      //
      // Claims rather than video rooms on purpose. A site visit is an
      // appointment too, and a diary that only showed video calls would hide
      // every property inspection the router now schedules.
      this.prisma.claim.count({
        where: { ...where, scheduledAssessmentTime: { gte: now } },
      }),

      this.prisma.claim.count({ where: { ...where, status: 'ASSIGNED' } }),

      // Intake volume. A case is not a claim: the firm vets it first and may
      // reject it, so the two counts differ and are shown as themselves.
      this.prisma.case.count({
        where: tenantContext?.tenantId ? { tenantId: tenantContext.tenantId } : {},
      }),

      // Status breakdown
      this.prisma.claim.groupBy({
        by: ['status'],
        where,
        _count: { status: true },
      }),
    ]);

    // Calculate monthly change percentage
    let monthlyChange = 0;
    if (completedLastMonth > 0) {
      monthlyChange = ((completedThisMonth - completedLastMonth) / completedLastMonth) * 100;
    } else if (completedThisMonth > 0) {
      monthlyChange = 100; // 100% increase if there were 0 last month
    }

    return {
      stats: {
        totalClaims,
        activeClaims,
        totalCases,
        completedThisMonth,
        completedThisWeek,
        // Over the days of the month elapsed, not a fixed seven. Dividing a
        // part-month by a whole week understates the rate every time.
        averagePerDay: parseFloat((completedThisMonth / now.getDate()).toFixed(1)),
        inProgress: upcomingAssessments,
        totalAssigned,
        monthlyChange: parseFloat(monthlyChange.toFixed(1)),
      },
      statusBreakdown: statusBreakdown.reduce(
        (acc, item) => {
          acc[item.status] = item._count.status;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }

  /**
   * Add a note to a claim with tenant validation
   */
  async addNote(claimId: string, content: string, authorId: string, tenantContext: TenantContext) {
    await this.findOne(claimId, tenantContext);

    const note = await this.prisma.claimNote.create({
      data: {
        claimId,
        content,
        authorId,
        authorType: (tenantContext.userRole as any) || 'ADJUSTER',
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userRole === 'CLAIMANT' ? null : tenantContext.userId,
      },
    });

    await this.createAuditTrail(
      claimId,
      'NOTE_ADDED',
      {
        noteId: note.id,
      },
      tenantContext
    );

    return note;
  }

  /**
   * Generate unique claim number
   */
  private async generateClaimNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.claim.count({
      where: {
        claimNumber: {
          startsWith: `CLM-${year}`,
        },
      },
    });

    return `CLM-${year}-${String(count + 1).padStart(6, '0')}`;
  }

  /**
   * JSON-safe value for audit storage (Prisma Json rejects Date/Decimal).
   */
  private auditSafe(value: unknown): any {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object' && 'toNumber' in (value as any)) {
      return Number((value as any).toNumber());
    }
    if (Array.isArray(value)) return value.map(v => this.auditSafe(v));
    if (typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, this.auditSafe(v)])
      );
    }
    return value;
  }

  /**
   * Before/after pair scoped to the fields actually being changed. Recording
   * the whole row would bloat the trail and copy PII; recording only the
   * changed fields is what makes the trail evidential (PD 12.8, FSA s.146).
   */
  private diffFields(before: Record<string, any>, after: Record<string, any>) {
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};
    for (const key of Object.keys(after)) {
      if (after[key] === undefined) continue;
      const from = this.auditSafe(before?.[key]);
      const to = this.auditSafe(after[key]);
      if (JSON.stringify(from) === JSON.stringify(to)) continue; // unchanged
      oldValues[key] = from;
      newValues[key] = to;
    }
    return { oldValues, newValues };
  }

  /**
   * Create audit trail entry
   */
  private async createAuditTrail(
    entityId: string,
    action: string,
    metadata: any,
    tenantContext?: TenantContext,
    changes?: { oldValues?: Record<string, any>; newValues?: Record<string, any> }
  ) {
    let actorType:
      | 'CLAIMANT'
      | 'ADJUSTER'
      | 'FIRM_ADMIN'
      | 'SUPER_ADMIN'
      | 'SIU_INVESTIGATOR'
      | 'COMPLIANCE_OFFICER'
      | 'SUPPORT_DESK'
      | 'SHARIAH_REVIEWER'
      | 'SYSTEM' = 'SYSTEM';

    if (tenantContext?.userRole) {
      actorType = tenantContext.userRole as typeof actorType;
    }

    // Shared fail-soft writer: the bespoke create failed requests over its own
    // bookkeeping (seen live on the document soft-delete) and produced rows in
    // service-local shapes. One writer, one shape, failures loud but non-fatal.
    await this.audit.record({
      entityId,
      entityType: 'CLAIM',
      action,
      metadata,
      oldValues: changes?.oldValues,
      newValues: changes?.newValues,
      tenantId: tenantContext?.tenantId,
      userId: tenantContext?.userRole === 'CLAIMANT' ? null : tenantContext?.userId,
      actorId: tenantContext?.userId,
      actorType,
    });

  }

  /**
   * Validate status transitions
   */
  private validateStatusTransition(currentStatus: ClaimStatus, newStatus: ClaimStatus) {
    // No `|| []` fallback: every ClaimStatus now has an explicit entry, so a
    // missing key is a compile error rather than a silent "no transitions
    // allowed" that reads identically to a deliberately terminal state.
    const allowed = CLAIM_STATUS_TRANSITIONS[currentStatus];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${currentStatus} to ${newStatus}`
      );
    }
  }

  /**
   * Encrypted NRIC snapshot for a claim: ciphertext plus a clear tail for
   * display. No blind index here — lookups go through the Claimant record,
   * which is the identity authority.
   */
  private async encryptedNric(nric: string | null | undefined) {
    if (!nric) return {};
    return {
      nricEncrypted: await this.encryption.encrypt(nric),
      nricLast4: this.encryption.lastDigits(nric),
    };
  }

}
