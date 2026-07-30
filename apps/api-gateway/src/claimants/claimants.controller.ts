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
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../config/prisma.service';
import { TenantGuard } from '../auth/guards/tenant.guard';
import { SkipTenantCheck } from '../auth/decorators/skip-tenant-check.decorator';

const normalizeNric = (n: string) => n?.replace(/\D/g, '') || '';

const normalizePhoneNumber = (p: string) => p?.replace(/\+/g, '')?.replace(/^60/g, '0') || '';

@ApiTags('claimants')
@Controller('claimants')
@UseGuards(TenantGuard)
export class ClaimantsController {
  private readonly logger = new Logger(ClaimantsController.name);

  constructor(private readonly prisma: PrismaService) {}

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
            claimant: true,
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

    const isNricValid =
      normalizeNric(nric) === normalizeNric(claimant.nric || session.claim.nric || '');
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
