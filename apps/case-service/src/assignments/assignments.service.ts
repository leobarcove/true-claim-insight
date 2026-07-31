import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AssignmentChannel,
  AssignmentMode,
  AssignmentStatus,
  Prisma,
  SlaStage,
} from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { SlaService } from '../sla/sla.service';
import { acknowledgementOutstanding, canOpenClaim, canTransition } from './assignment-lifecycle';

export interface ReceiveAssignmentInput {
  insurerTenantId: string;
  externalRef: string;
  mode?: AssignmentMode;
  channel?: AssignmentChannel;
  scope?: string;
  instructions?: string;
  appointedByName?: string;
  appointedByEmail?: string;
  /** When the instruction actually arrived, if not now — e.g. an email backdated. */
  receivedAt?: Date;
}

/**
 * Insurer appointments.
 *
 * The claim journey used to begin at `Claim`, which meant it began when the firm
 * decided to start work rather than when the insurer asked. That left the CSP
 * one-working-day acknowledgement measured from nothing, and PD 11.2(a)'s
 * end-to-end process missing its front end.
 *
 * Receiving an appointment starts the acknowledgement clock. Acknowledging or
 * declining stops it — both answer the insurer, and leaving the clock running on
 * a declined appointment would manufacture a breach out of a matter the firm
 * correctly refused.
 */
@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sla: SlaService,
    private readonly audit: AuditService
  ) {}

  /**
   * Log an appointment.
   *
   * Idempotent on (insurer, externalRef): the same instruction ingested twice —
   * a resent email, a retried API call, a Merimen poll that overlaps — returns
   * the existing record rather than creating a second. Duplicate appointments
   * would each carry their own acknowledgement clock, and the firm would appear
   * to have breached one of them.
   */
  async receive(input: ReceiveAssignmentInput, handlingTenantId: string) {
    const existing = await this.prisma.assignment.findUnique({
      where: {
        insurerTenantId_externalRef: {
          insurerTenantId: input.insurerTenantId,
          externalRef: input.externalRef,
        },
      },
    });
    if (existing) {
      this.logger.log(
        `Assignment ${input.externalRef} already logged (${existing.status}); ignoring duplicate`
      );
      return existing;
    }

    const receivedAt = input.receivedAt ?? new Date();

    const assignment = await this.prisma.assignment.create({
      data: {
        insurerTenantId: input.insurerTenantId,
        handlingTenantId,
        externalRef: input.externalRef,
        mode: input.mode ?? AssignmentMode.TPA_ADMIN,
        channel: input.channel ?? AssignmentChannel.EMAIL,
        scope: input.scope,
        instructions: input.instructions,
        appointedByName: input.appointedByName,
        appointedByEmail: input.appointedByEmail,
        receivedAt,
      },
    });

    await this.audit.record({
      entityType: 'ASSIGNMENT',
      entityId: assignment.id,
      action: 'ASSIGNMENT_RECEIVED',
      tenantId: handlingTenantId,
      newValues: {
        insurerTenantId: input.insurerTenantId,
        externalRef: input.externalRef,
        channel: assignment.channel,
        receivedAt,
      },
    });

    // The clock runs from when the instruction arrived, not from now.
    await this.sla.runQuietly(`start ACK on assignment ${assignment.id}`, () =>
      this.sla.startForAssignment(assignment.id, SlaStage.ACK_TO_INSURER, {
        tenantId: handlingTenantId,
        startedAt: receivedAt,
      })
    );

    this.logger.log(
      `Assignment ${assignment.externalRef} received via ${assignment.channel}; ` +
        'acknowledgement due within 1 working day'
    );
    return assignment;
  }

  private async load(id: string, tenantContext: TenantContext) {
    const assignment = await this.prisma.assignment.findUnique({ where: { id } });
    if (!assignment) throw new NotFoundException('Assignment not found');

    if (
      assignment.handlingTenantId !== tenantContext.tenantId &&
      assignment.insurerTenantId !== tenantContext.tenantId &&
      tenantContext.userRole !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenException('This assignment does not belong to your organisation');
    }
    return assignment;
  }

  private assertTransition(from: AssignmentStatus, to: AssignmentStatus) {
    if (!canTransition(from, to)) {
      throw new BadRequestException(`An assignment cannot move from ${from} to ${to}.`);
    }
  }

  /** Acknowledge to the insurer. Stops the CSP clock. */
  async acknowledge(id: string, tenantContext: TenantContext) {
    const assignment = await this.load(id, tenantContext);
    this.assertTransition(assignment.status, AssignmentStatus.ACKNOWLEDGED);

    const acknowledgedAt = new Date();
    const updated = await this.prisma.assignment.update({
      where: { id },
      data: { status: AssignmentStatus.ACKNOWLEDGED, acknowledgedAt },
    });

    await this.stopAckClock(assignment.id, 'acknowledged');
    await this.audit.record({
      entityType: 'ASSIGNMENT',
      entityId: id,
      action: 'ASSIGNMENT_ACKNOWLEDGED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      oldValues: { status: assignment.status },
      newValues: { status: AssignmentStatus.ACKNOWLEDGED, acknowledgedAt },
    });

    return updated;
  }

  /**
   * Decline the appointment.
   *
   * Also stops the clock: the insurer has been answered. A reason is required —
   * a refusal without one is unanswerable when the insurer asks why, and a
   * conflict of interest is exactly the kind of reason that must be on record.
   */
  async decline(id: string, reason: string, tenantContext: TenantContext) {
    const assignment = await this.load(id, tenantContext);
    this.assertTransition(assignment.status, AssignmentStatus.DECLINED);

    if (!reason?.trim()) {
      throw new BadRequestException('A reason is required to decline an appointment.');
    }

    const updated = await this.prisma.assignment.update({
      where: { id },
      data: { status: AssignmentStatus.DECLINED, declinedAt: new Date(), declineReason: reason },
    });

    await this.stopAckClock(assignment.id, 'declined');
    await this.audit.record({
      entityType: 'ASSIGNMENT',
      entityId: id,
      action: 'ASSIGNMENT_DECLINED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      oldValues: { status: assignment.status },
      newValues: { status: AssignmentStatus.DECLINED, reason },
    });

    return updated;
  }

  /** Attach a claim, moving the appointment to ACCEPTED. */
  async linkClaim(id: string, claimId: string, tenantContext: TenantContext) {
    const assignment = await this.load(id, tenantContext);

    const eligibility = canOpenClaim(assignment.status);
    if (!eligibility.allowed) {
      throw new BadRequestException(eligibility.reason);
    }
    if (assignment.claimId && assignment.claimId !== claimId) {
      throw new BadRequestException(
        'This appointment already has a claim. Open a supplementary assignment instead.'
      );
    }

    try {
      const updated = await this.prisma.assignment.update({
        where: { id },
        data: { claimId, status: AssignmentStatus.ACCEPTED },
      });

      await this.audit.record({
        entityType: 'ASSIGNMENT',
        entityId: id,
        action: 'ASSIGNMENT_CLAIM_LINKED',
        actorId: tenantContext.userId,
        tenantId: tenantContext.tenantId,
        newValues: { claimId, status: AssignmentStatus.ACCEPTED },
      });

      return updated;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException('That claim is already linked to another appointment.');
      }
      throw error;
    }
  }

  async complete(id: string, tenantContext: TenantContext) {
    const assignment = await this.load(id, tenantContext);
    this.assertTransition(assignment.status, AssignmentStatus.COMPLETED);

    return this.prisma.assignment.update({
      where: { id },
      data: { status: AssignmentStatus.COMPLETED, completedAt: new Date() },
    });
  }

  /** Appointments awaiting acknowledgement — the queue that matters most. */
  async outstanding(tenantContext: TenantContext) {
    const assignments = await this.prisma.assignment.findMany({
      where: { handlingTenantId: tenantContext.tenantId, status: AssignmentStatus.RECEIVED },
      orderBy: { receivedAt: 'asc' },
      include: { insurer: { select: { id: true, name: true } } },
    });

    return assignments.filter(assignment => acknowledgementOutstanding(assignment.status));
  }

  async findAll(tenantContext: TenantContext, status?: AssignmentStatus) {
    return this.prisma.assignment.findMany({
      where: {
        OR: [
          { handlingTenantId: tenantContext.tenantId },
          { insurerTenantId: tenantContext.tenantId },
        ],
        ...(status ? { status } : {}),
      },
      orderBy: { receivedAt: 'desc' },
      include: { insurer: { select: { id: true, name: true } } },
    });
  }

  async findOne(id: string, tenantContext: TenantContext) {
    return this.load(id, tenantContext);
  }

  /**
   * Stop the acknowledgement clock.
   *
   * The clock is keyed to the assignment, not to a claim — at the point the
   * acknowledgement is due there may not be a claim at all, which was precisely
   * the reason this obligation could not previously be measured.
   */
  private async stopAckClock(assignmentId: string, outcome: string) {
    await this.sla.runQuietly(`stop ACK on assignment ${assignmentId} (${outcome})`, () =>
      this.sla.stopForAssignment(assignmentId, SlaStage.ACK_TO_INSURER)
    );
  }
}
