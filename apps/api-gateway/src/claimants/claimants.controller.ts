import { Controller, Post, Body, HttpStatus, HttpException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../config/prisma.service';

const normalizeNric = (n: string) => n?.replace(/\D/g, '') || '';

const normalizePhoneNumber = (p: string) => p?.replace(/\+/g, '')?.replace(/^60/g, '0') || '';

@ApiTags('claimants')
@Controller('claimants')
export class ClaimantsController {
  private readonly logger = new Logger(ClaimantsController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Post('verify-nric')
  @ApiOperation({
    summary:
      'Verify claimant NRIC before joining video assessment (public - part of magic link flow)',
  })
  @ApiResponse({ status: 200, description: 'NRIC verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid NRIC' })
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

    if (!session) {
      throw new HttpException('Session not found', HttpStatus.NOT_FOUND);
    }

    const claimant = session.claim.claimant;
    if (!claimant) {
      throw new HttpException('Claimant not found for this session', HttpStatus.NOT_FOUND);
    }

    // Compare NRIC and Phone
    const isNricValid =
      normalizeNric(nric) === normalizeNric(claimant.nric || session.claim.nric || '');
    const isPhoneValid =
      normalizePhoneNumber(phoneNumber) === normalizePhoneNumber(claimant.phoneNumber);

    if (!isNricValid || !isPhoneValid) {
      this.logger.warn(`Verification failed for session ${sessionId}: Invalid NRIC or Phone`);
      throw new HttpException(
        'Verification failed. Invalid NRIC or Phone Number.',
        HttpStatus.BAD_REQUEST
      );
    }

    return {
      verified: true,
      message: 'Identity verified successfully',
    };
  }
}
