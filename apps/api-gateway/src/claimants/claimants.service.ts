import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Claimant } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';
import { TenantContext } from '../auth/guards/tenant.guard';

@Injectable()
export class ClaimantsService {
  private readonly logger = new Logger(ClaimantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find claimant by phone number
   */
  async findByPhone(phoneNumber: string, tenant?: TenantContext): Promise<Claimant | null> {
    return this.prisma.claimant.findFirst({
      where: {
        phoneNumber,
        ...(tenant && {
          OR: [
            { tenantId: null },
            { tenantId: tenant.tenantId },
          ],
        }),
      },
    });
  }

  /**
   * Find claimant by NRIC
   */
  async findByNric(nric: string, tenant?: TenantContext): Promise<Claimant | null> {
    return this.prisma.claimant.findFirst({
      where: {
        nric,
        ...(tenant && {
          OR: [
            { tenantId: null },
            { tenantId: tenant.tenantId },
          ],
        }),
      },
    });
  }

  /**
   * Find claimant by ID
   */
  async findById(id: string, tenant?: TenantContext): Promise<Claimant | null> {
    const claimant = await this.prisma.claimant.findUnique({
      where: { id },
    });

    if (claimant && tenant && claimant.tenantId && claimant.tenantId !== tenant.tenantId) {
      return null;
    }

    return claimant;
  }

  /**
   * Create a new claimant with phone and optional NRIC/name
   */
  async createClaimant(data: {
    phoneNumber: string;
    nric?: string;
    fullName?: string;
  }, tenant?: TenantContext): Promise<Claimant> {
    this.logger.log(`Creating new claimant for phone: ${data.phoneNumber}, NRIC: ${data.nric}`);

    return this.prisma.claimant.create({
      data: {
        phoneNumber: data.phoneNumber,
        nric: data.nric,
        fullName: data.fullName,
        tenantId: tenant?.tenantId,
        userId: tenant?.userId,
      },
    });
  }

  /**
   * Find or create claimant by NRIC (preferred) or phone number
   */
  async findOrCreate(data: {
    nric?: string;
    phoneNumber: string;
    fullName?: string;
  }, tenant?: TenantContext): Promise<Claimant> {
    let existing: Claimant | null = null;

    if (data.nric) {
      existing = await this.findByNric(data.nric, tenant);
    }

    if (!existing) {
      existing = await this.findByPhone(data.phoneNumber, tenant);
    }

    if (existing) {
      // Update last login or other fields if provided
      return this.prisma.claimant.update({
        where: { id: existing.id },
        data: {
          lastLoginAt: new Date(),
          ...(data.nric && !existing.nric && { nric: data.nric }),
          ...(data.fullName && !existing.fullName && { fullName: data.fullName }),
        },
      });
    }

    return this.createClaimant(data, tenant);
  }

  /**
   * Find or create claimant by phone number (Legacy/OTP Flow)
   */
  async findOrCreateByPhone(phoneNumber: string, tenant?: TenantContext): Promise<Claimant> {
    return this.findOrCreate({ phoneNumber }, tenant);
  }

  /**
   * Update claimant profile with eKYC data
   */
  async updateProfile(
    id: string,
    data: {
      fullName?: string;
      dateOfBirth?: Date;
      email?: string;
      nricHash?: string;
      nricEncrypted?: Uint8Array<ArrayBuffer>;
    },
    tenant?: TenantContext
  ): Promise<Claimant> {
    if (tenant) {
      const existing = await this.findById(id, tenant);
      if (!existing) throw new NotFoundException('Claimant not found or access denied');
    }

    return this.prisma.claimant.update({
      where: { id },
      data: {
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
        email: data.email,
        nricHash: data.nricHash,
        nricEncrypted: data.nricEncrypted,
      },
    });
  }

  /**
   * Update KYC status
   */
  async updateKycStatus(
    id: string,
    status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED',
    tenant?: TenantContext
  ): Promise<Claimant> {
    if (tenant) {
      const existing = await this.findById(id, tenant);
      if (!existing) throw new NotFoundException('Claimant not found or access denied');
    }

    return this.prisma.claimant.update({
      where: { id },
      data: {
        kycStatus: status,
        kycVerifiedAt: status === 'VERIFIED' ? new Date() : null,
      },
    });
  }

  /**
   * Get the first tenant ID associated with a claimant's claims
   * This is used to provide a tenant context for the JWT
   */
  async getFirstTenantId(claimantId: string): Promise<string | null> {
    const claim = await this.prisma.claim.findFirst({
      where: { claimantId },
      select: { insurerTenantId: true },
    });
    return claim?.insurerTenantId || null;
  }
}
