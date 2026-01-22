import { Injectable, Logger } from '@nestjs/common';
import { Claimant } from '@prisma/client';
import { PrismaService } from '../config/prisma.service';

@Injectable()
export class ClaimantsService {
  private readonly logger = new Logger(ClaimantsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find claimant by phone number
   */
  async findByPhone(phoneNumber: string): Promise<Claimant | null> {
    return this.prisma.claimant.findFirst({
      where: { phoneNumber },
    });
  }

  /**
   * Find claimant by NRIC
   */
  async findByNric(nric: string): Promise<Claimant | null> {
    return this.prisma.claimant.findUnique({
      where: { nric },
    });
  }

  /**
   * Find claimant by ID
   */
  async findById(id: string): Promise<Claimant | null> {
    return this.prisma.claimant.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new claimant with phone and optional NRIC/name
   */
  async createClaimant(data: {
    phoneNumber: string;
    nric?: string;
    fullName?: string;
  }): Promise<Claimant> {
    this.logger.log(`Creating new claimant for phone: ${data.phoneNumber}, NRIC: ${data.nric}`);

    return this.prisma.claimant.create({
      data: {
        phoneNumber: data.phoneNumber,
        nric: data.nric,
        fullName: data.fullName,
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
  }): Promise<Claimant> {
    let existing: Claimant | null = null;

    if (data.nric) {
      existing = await this.findByNric(data.nric);
    }

    if (!existing) {
      existing = await this.findByPhone(data.phoneNumber);
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

    return this.createClaimant(data);
  }

  /**
   * Find or create claimant by phone number (Legacy/OTP Flow)
   */
  async findOrCreateByPhone(phoneNumber: string): Promise<Claimant> {
    return this.findOrCreate({ phoneNumber });
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
    }
  ): Promise<Claimant> {
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
    status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED'
  ): Promise<Claimant> {
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
