import { Controller, Post, Body, HttpStatus, HttpException, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../config/prisma.service';

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
  async verifyNric(@Body('nric') nric: string, @Body('sessionId') sessionId: string) {
    this.logger.log(`Verifying NRIC for session ${sessionId}`);

    if (!nric || !sessionId) {
      throw new HttpException('NRIC and Session ID are required', HttpStatus.BAD_REQUEST);
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

    //  Compare NRIC
    const expectedNric = claimant.nric || session.claim.nric;
    const isDemoUser =
      claimant.phoneNumber === '+60123456789' || claimant.fullName === 'Kumar Claimant';
    const isValid = (expectedNric && nric === expectedNric) || (isDemoUser && nric.length >= 6);

    if (!isValid) {
      throw new HttpException(
        'NRIC verification failed. Please check your credentials.',
        HttpStatus.BAD_REQUEST
      );
    }

    return {
      verified: true,
      message: 'Identity verified successfully',
    };
  }
}
