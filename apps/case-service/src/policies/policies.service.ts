import { Injectable, NotFoundException } from '@nestjs/common';
import { PolicySource, Prisma } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { CreatePolicyDto } from './dto/create-policy.dto';

/**
 * Minimal policy store for the TPA model. Policy data currently arrives from
 * the insurer (MSIG) by email and is keyed in manually (source=MANUAL).
 * Future adapters upsert here too: an insurer API integration (source=API)
 * or a structured file drop from the insurer (source=FILE_FEED) — no schema
 * change required. Note: scraping an insurer's agency portal is deliberately
 * not an option here (docs/MASTER_PLAN.md §6.11).
 *
 * Lookup deliberately spans tenants: the TPA administers policies for every
 * insurer on its panel, and case intake needs to match a claimant-supplied
 * policy number regardless of which insurer issued it.
 */
@Injectable()
export class PoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: { search?: string; page?: string; limit?: string }) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Number(query.limit) || 20);

    const where: Prisma.PolicyWhereInput = query.search
      ? {
          OR: [
            { policyNumber: { contains: query.search, mode: 'insensitive' } },
            { insuredName: { contains: query.search, mode: 'insensitive' } },
            { insuredPhone: { contains: query.search } },
          ],
        }
      : {};

    const [policies, total] = await Promise.all([
      this.prisma.policy.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { tenant: { select: { id: true, name: true } } },
      }),
      this.prisma.policy.count({ where }),
    ]);

    return {
      policies,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const policy = await this.prisma.policy.findUnique({
      where: { id },
      include: { tenant: { select: { id: true, name: true } } },
    });
    if (!policy) throw new NotFoundException('Policy not found');
    return policy;
  }

  async create(dto: CreatePolicyDto) {
    return this.prisma.policy.upsert({
      where: {
        tenantId_policyNumber: { tenantId: dto.tenantId, policyNumber: dto.policyNumber },
      },
      update: {
        insuredName: dto.insuredName,
        insuredNric: dto.insuredNric,
        insuredPhone: dto.insuredPhone,
        planTier: dto.planTier,
        tripStartDate: dto.tripStartDate ? new Date(dto.tripStartDate) : undefined,
        tripEndDate: dto.tripEndDate ? new Date(dto.tripEndDate) : undefined,
        destination: dto.destination,
      },
      create: {
        tenantId: dto.tenantId,
        policyNumber: dto.policyNumber,
        insuredName: dto.insuredName,
        insuredNric: dto.insuredNric,
        insuredPhone: dto.insuredPhone,
        planTier: dto.planTier,
        tripStartDate: dto.tripStartDate ? new Date(dto.tripStartDate) : null,
        tripEndDate: dto.tripEndDate ? new Date(dto.tripEndDate) : null,
        destination: dto.destination,
        source: PolicySource.MANUAL,
      },
    });
  }
}
