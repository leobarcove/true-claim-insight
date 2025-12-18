import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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
  private async checkRateLimit(phoneNumber: string): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentOtps = await this.prisma.otpCode.count({
      where: {
        phoneNumber,
        createdAt: { gte: oneHourAgo },
      },
    });

    if (recentOtps >= this.RATE_LIMIT_PER_HOUR) {
      throw new HttpException(
        'Too many OTP requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * Send OTP to phone number
   * In production, this would integrate with an SMS gateway (e.g., Twilio, Vonage)
   */
  async sendOtp(phoneNumber: string): Promise<{ expiresIn: number }> {
    // Check rate limit
    await this.checkRateLimit(phoneNumber);

    // Invalidate any existing unused OTPs for this phone
    await this.prisma.otpCode.updateMany({
      where: {
        phoneNumber,
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
      },
    });

    // TODO: Send SMS via provider (Twilio, Vonage, etc.)
    // For now, log to console for development
    this.logger.log(`[DEV] OTP for ${phoneNumber}: ${code}`);
    console.log(`\n${'='.repeat(50)}`);
    console.log(`📱 OTP Code for ${phoneNumber}: ${code}`);
    console.log(`   Expires in ${this.OTP_EXPIRY_MINUTES} minutes`);
    console.log(`${'='.repeat(50)}\n`);

    return { expiresIn: this.OTP_EXPIRY_MINUTES * 60 };
  }

  /**
   * Verify OTP code
   * Returns true if valid, throws error if invalid
   */
  async verifyOtp(phoneNumber: string, code: string): Promise<boolean> {
    // Find the most recent unexpired, unverified OTP
    const otpRecord = await this.prisma.otpCode.findFirst({
      where: {
        phoneNumber,
        expiresAt: { gt: new Date() },
        verified: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otpRecord) {
      throw new BadRequestException('No valid OTP found. Please request a new one.');
    }

    // Check attempts
    if (otpRecord.attempts >= this.MAX_ATTEMPTS) {
      throw new BadRequestException(
        'Too many failed attempts. Please request a new OTP.',
      );
    }

    // Increment attempts
    await this.prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { attempts: { increment: 1 } },
    });

    // Verify code
    if (otpRecord.code !== code) {
      const remainingAttempts = this.MAX_ATTEMPTS - otpRecord.attempts - 1;
      throw new BadRequestException(
        `Invalid OTP code. ${remainingAttempts} attempts remaining.`,
      );
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
   * Cleanup expired OTP codes (can be called via cron job)
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
