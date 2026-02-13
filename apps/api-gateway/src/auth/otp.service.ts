import { Injectable, Logger, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../config/prisma.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_EXPIRY_MINUTES = 5;
  private readonly MAX_ATTEMPTS = 3;
  private readonly RATE_LIMIT_PER_HOUR = 5;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate a 6-digit OTP code
   */
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
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
  async sendOtp(phoneNumber: string, tenantId?: string, userId?: string): Promise<{ expiresIn: number }> {
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

    // TODO: Send SMS via provider
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📱 OTP Code for ${phoneNumber}: ${code}`);
    if (tenantId) console.log(`   Tenant: ${tenantId}`);
    console.log(`   Expires in ${this.OTP_EXPIRY_MINUTES} minutes`);
    console.log(`${'='.repeat(50)}\n`);

    return { expiresIn: this.OTP_EXPIRY_MINUTES * 60 };
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

    // TEMP: dev code
    const isDevCode = code === '123123';

    // Verify code
    if (!isDevCode && otpRecord.code !== code) {
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
