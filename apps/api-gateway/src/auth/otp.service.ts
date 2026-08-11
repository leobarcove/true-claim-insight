import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../config/prisma.service';
import { OTP_TRANSPORT, type OtpTransport } from './otp-transport.interface';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_EXPIRY_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RATE_LIMIT_PER_HOUR = 5;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OTP_TRANSPORT) private readonly transport: OtpTransport
  ) {}

  /**
   * Production is the one environment where an undelivered code is a failure
   * rather than a workaround.
   *
   * Read once, from NODE_ENV, and used only to decide whether a code may be
   * returned to the caller. Defaulting to *treating unknown as production* is
   * deliberate: the failure mode of guessing wrong in that direction is a
   * login that does not work, and in the other it is handing out credentials.
   */
  private get isProduction(): boolean {
    return (process.env.NODE_ENV ?? 'production') === 'production';
  }

  /**
   * Generate a 6-digit OTP code.
   *
   * CSPRNG, not Math.random(): an OTP is a credential, and a predictable
   * generator turns "we texted you a secret" into "we texted you a guessable
   * number".
   */
  private generateCode(): string {
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Check rate limit for phone number
   */
  private async checkRateLimit(phoneNumber: string, tenantId?: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentOtps = await this.prisma.otpCode.count({
      where: {
        phoneNumber,
        tenantId,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentOtps >= this.RATE_LIMIT_PER_HOUR) {
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  /**
   * Send OTP to phone number
   */
  async sendOtp(
    phoneNumber: string,
    tenantId?: string,
    userId?: string
  ): Promise<{ expiresIn: number; code?: string }> {
    // Check rate limit
    await this.checkRateLimit(phoneNumber, tenantId);

    // Invalidate any existing unused OTPs for this phone/tenant
    await this.prisma.otpCode.updateMany({
      where: {
        phoneNumber,
        tenantId,
        verified: false,
        expiresAt: { gt: new Date() },
      },
      data: {
        expiresAt: new Date(), // Expire immediately
      },
    });

    // Generate new OTP
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP
    await this.prisma.otpCode.create({
      data: {
        phoneNumber,
        code,
        expiresAt,
        tenantId,
        userId,
      },
    });

    const delivery = await this.transport.send(phoneNumber, code);

    if (delivery.delivered) {
      this.logger.log(`OTP sent to ${phoneNumber} via ${this.transport.name}`);
      return { expiresIn: this.OTP_EXPIRY_MINUTES * 60 };
    }

    // Nothing carried the code. In production that is an outage, and failing
    // loudly is the only safe answer: the alternative is returning a live
    // credential over HTTP to whoever asked for it, which is indistinguishable
    // from having no authentication at all.
    if (this.isProduction) {
      this.logger.error(
        `No OTP transport could deliver to ${phoneNumber}. Refusing to return the code.`
      );
      throw new ServiceUnavailableException(
        'We cannot send a verification code right now. Please try again shortly.'
      );
    }

    // Outside production there is no SMS provider yet, so the code comes back
    // in the response and the app fills it in. Verification itself is
    // untouched — the code is still random, still stored, still expires in
    // five minutes, still rate limited, and still burns an attempt when wrong.
    // What is stubbed is delivery, not the check.
    this.logger.warn(
      `Returning the OTP for ${phoneNumber} in the response (NODE_ENV=${process.env.NODE_ENV}). ` +
        'This never happens in production.'
    );
    return { expiresIn: this.OTP_EXPIRY_MINUTES * 60, code };
  }

  /**
   * Verify OTP code
   */
  async verifyOtp(phoneNumber: string, code: string, tenantId?: string): Promise<boolean> {
    // Find the most recent unexpired, unverified OTP
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        phoneNumber,
        tenantId,
        expiresAt: { gt: new Date() },
        verified: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('Invalid code. Please request a new code.');
    }

    // Check attempts
    if (otpRecord.attempts >= this.MAX_ATTEMPTS) {
      throw new BadRequestException('Too many failed attempts. Please request a new code.');
    }

    // Increment attempts
    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });

    // No dev bypass. A hardcoded universal code ('123123', removed 10 Aug
    // 2026) verified any phone number in any environment, including staging.
    // Local development does not need one: the real code is printed to the
    // console above until an SMS transport exists.
    if (otpRecord.code !== code) {
      const remainingAttempts = this.MAX_ATTEMPTS - otpRecord.attempts - 1;
      throw new BadRequestException(`Invalid code. ${remainingAttempts} attempts remaining.`);
    }

    // Mark as verified
    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { verified: true },
    });

    this.logger.log(`OTP verified for ${phoneNumber}`);
    return true;
  }

  /**
   * Cleanup expired OTP codes
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.otpCode.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired OTP codes`);
    }

    return result.count;
  }
}
