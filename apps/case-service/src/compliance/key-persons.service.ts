import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { KeyPersonType, Prisma } from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { TenantContext } from '../common/guards/tenant.guard';
import { PrismaService } from '../config/prisma.service';
import { BnmNotificationsService } from './bnm-notifications.service';
import { ComplianceEventsService } from './compliance-events.service';
import {
  applicableCriteria,
  fitStanding,
  validateAttestation,
  type CriterionResponse,
} from './fit-and-proper';

/**
 * The shareholders/KRP register and its fit-and-proper attestations
 * (PD 10.1/10.2).
 *
 * A NOT_MET finding is recorded, not blocked — the honest record of an unfit
 * finding is the whole point — and it raises a CRITICAL compliance event, so
 * the Board sees it on the same register as everything else. What is refused
 * is silence: an attestation must answer every applicable criterion, and every
 * NOT_MET must say what was found.
 */
@Injectable()
export class KeyPersonsService {
  private readonly logger = new Logger(KeyPersonsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly compliance: ComplianceEventsService,
    private readonly bnm: BnmNotificationsService
  ) {}

  async create(
    data: { fullName: string; type: KeyPersonType; position?: string; appointedAt: string; notes?: string },
    tenantContext: TenantContext
  ) {
    if (!data.fullName?.trim()) throw new BadRequestException('fullName is required.');
    const appointedAt = new Date(data.appointedAt);
    if (Number.isNaN(appointedAt.getTime())) {
      throw new BadRequestException('appointedAt must be a valid date.');
    }

    const person = await this.prisma.keyPerson.create({
      data: { ...data, appointedAt },
    });

    await this.audit.record({
      entityType: 'KEY_PERSON',
      entityId: person.id,
      action: 'KEY_PERSON_REGISTERED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { fullName: data.fullName, type: data.type, appointedAt },
    });

    // PD 13.1(d): a change to directors, CEO or shareholders is notifiable —
    // drafted here because this act IS the change.
    await this.bnm.draft(
      {
        changeType: 'DIRECTOR_CEO_SHAREHOLDER_CHANGE',
        description: `Appointment: ${data.fullName} (${data.type}${data.position ? ', ' + data.position : ''})`,
        occurredAt: appointedAt,
        keyPersonId: person.id,
      },
      tenantContext.userId
    );
    return person;
  }

  /** Cessation is a dated act — and, later, the PD 13.1 notification trigger. */
  async cease(id: string, tenantContext: TenantContext) {
    const person = await this.load(id);
    if (person.ceasedAt) throw new BadRequestException('This person has already ceased.');

    const ceased = await this.prisma.keyPerson.update({
      where: { id },
      data: { ceasedAt: new Date() },
    });
    await this.audit.record({
      entityType: 'KEY_PERSON',
      entityId: id,
      action: 'KEY_PERSON_CEASED',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      oldValues: { fullName: person.fullName, type: person.type },
    });

    await this.bnm.draft(
      {
        changeType: 'DIRECTOR_CEO_SHAREHOLDER_CHANGE',
        description: `Cessation: ${person.fullName} (${person.type})`,
        occurredAt: ceased.ceasedAt!,
        keyPersonId: person.id,
      },
      tenantContext.userId
    );
    return ceased;
  }

  /** The register with each person's current standing. */
  async list(includeCeased = false) {
    const persons = await this.prisma.keyPerson.findMany({
      where: includeCeased ? {} : { ceasedAt: null },
      include: { attestations: { orderBy: { attestedAt: 'desc' }, take: 1 } },
      orderBy: { fullName: 'asc' },
    });

    const now = new Date();
    return persons.map(person => ({
      id: person.id,
      fullName: person.fullName,
      type: person.type,
      position: person.position,
      appointedAt: person.appointedAt,
      ceasedAt: person.ceasedAt,
      standing: fitStanding(person.attestations[0] ?? null, now),
      lastAttestedAt: person.attestations[0]?.attestedAt ?? null,
    }));
  }

  /** The criteria this person must answer — for the attestation form. */
  async criteriaFor(id: string) {
    const person = await this.load(id);
    return applicableCriteria(person.type);
  }

  async attest(
    id: string,
    responses: Record<string, CriterionResponse>,
    notes: string | undefined,
    tenantContext: TenantContext
  ) {
    const person = await this.load(id);
    if (person.ceasedAt) {
      throw new BadRequestException('Cannot attest for a person who has ceased.');
    }

    const validation = validateAttestation(person.type, responses ?? {});
    if (validation.missing.length) {
      throw new BadRequestException(
        `Every applicable criterion must be answered; missing: ${validation.missing.join(', ')}. ` +
          'Silence on a criterion is not attestation of it (PD 10.1/10.2).'
      );
    }
    if (validation.notMetWithoutNote.length) {
      throw new BadRequestException(
        `A NOT_MET outcome requires the finding described: ${validation.notMetWithoutNote.join(', ')}.`
      );
    }

    const allMet = validation.notMet.length === 0;
    const attestation = await this.prisma.fitProperAttestation.create({
      data: {
        keyPersonId: id,
        responses: responses as unknown as Prisma.InputJsonValue,
        allMet,
        attestedByUserId: tenantContext.userId,
        notes,
      },
    });

    await this.audit.record({
      entityType: 'KEY_PERSON',
      entityId: id,
      action: allMet ? 'FIT_PROPER_ATTESTED' : 'FIT_PROPER_NOT_MET',
      actorId: tenantContext.userId,
      userId: tenantContext.userId,
      tenantId: tenantContext.tenantId,
      newValues: { allMet, notMet: validation.notMet },
    });

    if (!allMet) {
      this.logger.warn(
        `Fit-and-proper NOT MET for ${person.fullName}: ${validation.notMet.join(', ')}`
      );
      await this.compliance.raiseQuietly({
        type: 'POLICY_BREACH',
        severity: 'CRITICAL',
        title: `Fit-and-proper criteria not met: ${person.fullName} (${person.type})`,
        details:
          `Criteria not met: ${validation.notMet.join(', ')} (PD 10.1/10.2). ` +
          'The register records the finding; the response to it is the Board\'s.',
        dedupeKey: `fit-proper:${id}:${attestation.id}`,
        source: 'fit-and-proper-attestation',
        raisedByUserId: tenantContext.userId,
      });
    }
    return attestation;
  }

  async attestations(id: string) {
    await this.load(id);
    return this.prisma.fitProperAttestation.findMany({
      where: { keyPersonId: id },
      orderBy: { attestedAt: 'desc' },
    });
  }

  private async load(id: string) {
    const person = await this.prisma.keyPerson.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('Key person not found');
    return person;
  }
}
