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
    return this.prisma.claimant.findUnique({
      where: { phoneNumber },
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
   * Create a new claimant with just phone number (phone-first registration)
   * Additional details (NRIC, name, DOB) will be added during eKYC
   */
  async createFromPhone(phoneNumber: string): Promise<Claimant> {
    this.logger.log(`Creating new claimant for phone: ${phoneNumber}`);

    return this.prisma.claimant.create({
      data: {
        phoneNumber,
      },
    });
  }

  /**
   * Find or create claimant by phone number
   * Used during OTP verification to ensure claimant exists
   */
  async findOrCreateByPhone(phoneNumber: string): Promise<Claimant> {
    const existing = await this.findByPhone(phoneNumber);

    if (existing) {
      // Update last login
      return this.prisma.claimant.update({
        where: { id: existing.id },
        data: { lastLoginAt: new Date() },
      });
    }

    return this.createFromPhone(phoneNumber);
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
    status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'EXPIRED',
  ): Promise<Claimant> {
    return this.prisma.claimant.update({
      where: { id },
      data: {
        kycStatus: status,
        kycVerifiedAt: status === 'VERIFIED' ? new Date() : null,
      },
    });
  }
}
