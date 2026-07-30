import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Claimant } from '@prisma/client';
import { EncryptionService } from '@tci/crypto';
import { PrismaService } from '../config/prisma.service';
import { TenantContext } from '../auth/guards/tenant.guard';

/**
 * A claimant as it comes back from a normal query: no ciphertext, no blind
 * index. Those are omitted client-wide (see SENSITIVE_FIELD_OMIT) so they
 * cannot reach a response body by accident; the paths that need them opt in.
 */
type ClaimantRow = Omit<Claimant, 'nricEncrypted' | 'nricHash'>;

@Injectable()
export class ClaimantsService {
  private readonly logger = new Logger(ClaimantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly configService: ConfigService
  ) {}

  /** Secret that makes the blind index unguessable. */
  private get pepper(): string {
    const pepper = this.configService.get<string>('NRIC_INDEX_PEPPER');
    if (!pepper) {
      throw new Error(
        'NRIC_INDEX_PEPPER is not set. Generate one with:\n' +
          '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"\n' +
          'Note it is effectively permanent: changing it invalidates every stored ' +
          'nricHash and breaks NRIC lookups until all values are re-indexed.'
      );
    }
    return pepper;
  }

  /** Blind index for an NRIC, or null when absent. */
  private nricIndex(nric: string | null | undefined): string | null {
    return this.encryption.blindIndex(nric, this.pepper);
  }

  /**
   * The three columns that together replace the old plaintext `nric`:
   * a blind index for lookup, the ciphertext, and a clear tail for display.
   */
  private async nricFields(nric: string | null | undefined) {
    if (!nric) return {};
    return {
      nricHash: this.nricIndex(nric),
      nricEncrypted: await this.encryption.encrypt(nric),
      nricLast4: this.encryption.lastDigits(nric),
    };
  }

  /**
   * Find claimant by phone number
   */
  async findByPhone(phoneNumber: string, tenant?: TenantContext): Promise<ClaimantRow | null> {
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
   * Find claimant by NRIC.
   *
   * Matches on the blind index rather than the value: the NRIC is encrypted at
   * rest, so it cannot be queried directly. Normalised-exact matching is the
   * right semantic for an identity number — fuzzy matching would merge two
   * people's claims.
   */
  async findByNric(nric: string, tenant?: TenantContext): Promise<ClaimantRow | null> {
    const nricHash = this.nricIndex(nric);
    if (!nricHash) return null;

    return this.prisma.claimant.findFirst({
      where: {
        nricHash,
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
   * Does this NRIC belong to this claimant?
   *
   * Compares blind indexes in constant time — no decryption, and no timing
   * signal about how much of the value matched. The Claimant record is the
   * identity authority; `Claim.nricEncrypted` is only a denormalised snapshot
   * and is deliberately not consulted here.
   */
  matchesNric(claimant: Pick<Claimant, 'nricHash'>, nric: string): boolean {
    const candidate = this.nricIndex(nric);
    if (!candidate || !claimant.nricHash) return false;
    return this.encryption.indexMatches(candidate, claimant.nricHash);
  }

  /**
   * Find claimant by ID
   */
  async findById(id: string, tenant?: TenantContext): Promise<ClaimantRow | null> {
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
  }, tenant?: TenantContext): Promise<ClaimantRow> {
    // PDPA: never write NRIC (or other identity numbers) to application logs.
    this.logger.log(`Creating new claimant for phone: ${data.phoneNumber}`);

    return this.prisma.claimant.create({
      data: {
        phoneNumber: data.phoneNumber,
        ...(await this.nricFields(data.nric)),
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
  }, tenant?: TenantContext): Promise<ClaimantRow> {
    let existing: ClaimantRow | null = null;

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
          // Fill in an NRIC only when the record has none. `nricLast4` is the
          // readable proxy for "an NRIC is on file" — the three columns are
          // always written together — so this check needs no ciphertext.
          ...(data.nric && !existing.nricLast4 ? await this.nricFields(data.nric) : {}),
          ...(data.fullName && !existing.fullName && { fullName: data.fullName }),
        },
      });
    }

    return this.createClaimant(data, tenant);
  }

  /**
   * Find or create claimant by phone number (Legacy/OTP Flow)
   */
  async findOrCreateByPhone(phoneNumber: string, tenant?: TenantContext): Promise<ClaimantRow> {
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
      nric?: string;
    },
    tenant?: TenantContext
  ): Promise<ClaimantRow> {
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
        ...(await this.nricFields(data.nric)),
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
  ): Promise<ClaimantRow> {
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
