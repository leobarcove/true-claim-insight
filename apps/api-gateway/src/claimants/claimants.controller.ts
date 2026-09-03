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
   * Who we already hold for this number, without writing anything.
   *
   * The agent-assisted form asks this while the agent is still reading a number
   * back over the phone, so it must not create. It used to: **Find claimant**
   * called `resolve` below, and a mistyped digit left a permanent claimant row
   * carrying a name and an IC that belonged to nobody — with nothing in the
   * flow to remove it when the agent noticed and retyped.
   *
   * Worse than the litter was the order. That row is personal data, and it was
   * written before consent had been recorded, on a screen that told the agent
   * "nothing is saved yet" and one screen before another that says no details
   * may be entered until it is. Creation now happens where consent is attested;
   * this route only answers whether we have met them before, which is what the
   * agent actually needs in order not to re-key a name already on file.
   */
  @Post('lookup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADJUSTER', 'FIRM_ADMIN', 'SUPER_ADMIN')
  @SkipTenantCheck()
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Look up the claimant an assisted claim is for, without creating one' })
  async lookup(@Body() body: { phoneNumber: string; nric?: string }) {
    if (!body?.phoneNumber?.trim()) {
      throw new HttpException('A mobile number is required.', HttpStatus.BAD_REQUEST);
    }

    const claimant = await this.claimantsService.lookup({
      phoneNumber: body.phoneNumber,
      nric: body.nric,
    });

    // A number we do not hold is an ordinary answer. `existing: false` with no
    // claimant is what the form draws "no record yet" from.
    if (!claimant) return { existing: false, claimant: null };

    return {
      existing: true,
      /*
        Which field matched, said out loud.

        The IC wins where one is given, so a claimant can be found on a number
        that is not theirs — a new handset, or a digit typed wrongly that
        happens to belong to nobody. The screen cannot explain what it matched
        unless it is told, and an agent who is not told attaches the claim to a
        record whose phone number is not the one they are speaking to.
      */
      matchedOn: claimant.phoneNumber === body.phoneNumber ? 'phone' : 'nric',
      claimant: {
        id: claimant.id,
        phoneNumber: claimant.phoneNumber,
        fullName: claimant.fullName ?? null,
        nricLast4: (claimant as { nricLast4?: string | null }).nricLast4 ?? null,
        existing: true,
      },
    };
  }

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
   *
   * Called at the moment consent is attested, and not before. The agent's
   * lookup screen uses `lookup` above, which writes nothing — so a number typed
   * wrongly and corrected leaves no trace, and no personal data is stored
   * before there is a lawful basis for storing it.
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
