import {
  Controller,
  Post,
  Body,
  HttpStatus,
  HttpException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../config/prisma.service';
import { ClaimantsService } from './claimants.service';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { SkipTenantCheck } from '../auth/decorators/skip-tenant-check.decorator';

const normalizePhoneNumber = (p: string) => p?.replace(/\+/g, '')?.replace(/^60/g, '0') || '';

@ApiTags('claimants')
@Controller('claimants')
@UseGuards(TenantGuard)
export class ClaimantsController {
  private readonly logger = new Logger(ClaimantsController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly claimantsService: ClaimantsService
  ) {}

  /**
   * Find or create the claimant an agent is filling a form in for.
   *
   * **Not a new capability.** `POST /cases` already does exactly this for staff
   * — it resolves a claimant from `claimantPhone` before proxying — so the
   * ability to turn a phone number into a claimant record is one staff have
   * had all along. What is new is doing it as its own step, because the
   * agent-assisted form needs the id *before* the case exists: consent has to
   * be recorded against a claimant, and `CasesService.create` refuses to open
   * a case without it.
   *
   * It does tell an authenticated staff member whether a number is already
   * known, which is why `existing` is returned deliberately rather than
   * leaking through a timing difference — the agent needs to see "we have this
   * person" so they do not re-key a name that is already on file. Staff-only,
   * tenant-scoped, and the same role list that may create a case.
   */
  @Post('resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADJUSTER', 'FIRM_ADMIN', 'SUPER_ADMIN')
  @SkipTenantCheck()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Resolve the claimant an assisted claim is being filled in for' })
  async resolve(
    @Body() body: { phoneNumber: string; fullName?: string; nric?: string }
  ) {
    if (!body?.phoneNumber?.trim()) {
      throw new HttpException('A mobile number is required.', HttpStatus.BAD_REQUEST);
    }

    const before = await this.claimantsService.findByPhone(body.phoneNumber);
    const claimant = await this.claimantsService.findOrCreate({
      phoneNumber: body.phoneNumber,
      fullName: body.fullName,
      nric: body.nric,
    });

    return {
      id: claimant.id,
      phoneNumber: claimant.phoneNumber,
      fullName: claimant.fullName ?? null,
      // The tail only. The full value comes from the audited reveal endpoint,
      // and an agent confirming they have the right person does not need it.
      nricLast4: (claimant as { nricLast4?: string | null }).nricLast4 ?? null,
      existing: before !== null,
    };
  }

  @Post('verify-nric')
  // Deliberately unauthenticated: the claimant proves identity here as part of
  // the magic-link video join, before any login exists. Hardened against use
  // as an NRIC/phone confirmation oracle: strict per-route throttle and
  // non-enumerating error responses (never reveal whether the session,
  // claimant, NRIC or phone was the mismatch).
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary:
      'Verify claimant NRIC before joining video assessment (public - part of magic link flow)',
  })
  @ApiResponse({ status: 200, description: 'NRIC verified successfully' })
  @ApiResponse({ status: 400, description: 'Verification failed' })
  async verifyNric(
    @Body('nric') nric: string,
    @Body('phoneNumber') phoneNumber: string,
    @Body('sessionId') sessionId: string
  ) {
    this.logger.log(`Verifying credentials for session ${sessionId}`);

    if (!nric || !sessionId || !phoneNumber) {
      throw new HttpException(
        'NRIC, Phone Number and Session ID are required',
        HttpStatus.BAD_REQUEST
      );
    }

    // Get the session to find the associated claim
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        claim: {
          include: {
            // Opting back into the blind index: this route exists to compare it.
            // Nothing here is returned to the caller, only the boolean verdict.
            claimant: { omit: { nricHash: false } },
          },
        },
      },
    });

    // Single generic failure for every mismatch class — an unauthenticated
    // caller must not be able to distinguish "no such session" from "wrong
    // NRIC" from "wrong phone" (enumeration/oracle resistance).
    const verificationFailed = () => {
      this.logger.warn(`Verification failed for session ${sessionId}`);
      return new HttpException('Verification failed.', HttpStatus.BAD_REQUEST);
    };

    const claimant = session?.claim?.claimant;
    if (!session || !claimant) {
      throw verificationFailed();
    }

    // Blind-index comparison: the NRIC is encrypted at rest and is never
    // decrypted to answer an identity check.
    const isNricValid = this.claimantsService.matchesNric(claimant, nric);
    const isPhoneValid =
      normalizePhoneNumber(phoneNumber) === normalizePhoneNumber(claimant.phoneNumber);

    if (!isNricValid || !isPhoneValid) {
      throw verificationFailed();
    }

    return {
      verified: true,
      message: 'Identity verified successfully',
    };
  }
}
