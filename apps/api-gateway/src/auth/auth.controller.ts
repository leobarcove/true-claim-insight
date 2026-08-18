import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Get,
  Res,
  Req,
  UnauthorizedException,
  Delete,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { ClaimantsService } from '../claimants/claimants.service';
import { RegisterDto, LoginDto, ChangePasswordDto, RegisterVerifyDto } from './dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ResolveIntakeClaimantDto } from './dto/resolve-intake-claimant.dto';
import { ResolveChannelClaimantDto } from './dto/resolve-channel-claimant.dto';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly claimantsService: ClaimantsService,
    private readonly jwtService: JwtService
  ) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) response: FastifyReply
  ) {
    const result = await this.authService.register(registerDto);
    if (result.tokens) {
      this.setRefreshTokenCookie(response, result.tokens.refreshToken);
    }
    return result;
  }

  @Post('register/verify-otp')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify registration OTP' })
  @ApiResponse({ status: 200, description: 'User verified and tokens returned' })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyRegistration(
    @Body() dto: RegisterVerifyDto,
    @Res({ passthrough: true }) response: FastifyReply
  ) {
    const result = await this.authService.verifyRegistration(dto.userId, dto.code);
    this.setRefreshTokenCookie(response, result.tokens!.refreshToken);
    return result;
  }

  @Post('login')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) response: FastifyReply) {
    const result = await this.authService.login(loginDto);
    this.setRefreshTokenCookie(response, result.tokens!.refreshToken);
    return result;
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Req() request: any, @Res({ passthrough: true }) response: FastifyReply) {
    const refreshToken = request.cookies?.refreshToken;
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token missing');
    }

    const tokens = await this.authService.refreshTokens(refreshToken);
    this.setRefreshTokenCookie(response, tokens.refreshToken); // Rotation
    return tokens;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout and invalidate tokens' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(@Res({ passthrough: true }) response: FastifyReply) {
    response.clearCookie('refreshToken', {
      path: '/api/v1/auth/refresh',
    });

    return { message: 'Logout successful' };
  }

  private setRefreshTokenCookie(response: FastifyReply, refreshToken: string) {
    response.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@CurrentUser() user: Express.User) {
    const userTenants = await this.authService.getUserTenants(user.id);

    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      phoneNumber: user.phoneNumber,
      licenseNumber: user.licenseNumber || (user as any).adjuster?.licenseNumber,
      avatarUrl: (user as any).avatarUrl,
      tenantId: user.tenantId,
      currentTenantId: (user as any).currentTenantId || user.tenantId,
      tenantName: user.tenant?.name || (user as any).currentTenant?.name,
      userTenants,
    };
  }

  @Post('switch-tenant')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Switch to a different tenant context' })
  @ApiResponse({ status: 200, description: 'Tenant switched successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized or no access to tenant' })
  async switchTenant(
    @CurrentUser() user: Express.User,
    @Body() dto: any, // Import SwitchTenantDto
    @Req() request: any,
    @Res({ passthrough: true }) response: FastifyReply
  ) {
    const ipAddress = request.ip;
    const userAgent = request.headers['user-agent'];

    const result = await this.authService.switchTenant(user.id, dto.tenantId, ipAddress, userAgent);
    this.setRefreshTokenCookie(response, result.tokens!.refreshToken);

    return result;
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Change user password' })
  @ApiResponse({ status: 200, description: 'Password changed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid current password' })
  async changePassword(@CurrentUser() user: Express.User, @Body() dto: ChangePasswordDto) {
    await this.authService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return { message: 'Password changed successfully' };
  }

  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete current user account' })
  @ApiResponse({ status: 200, description: 'Account deleted successfully' })
  async deleteAccount(
    @CurrentUser() user: Express.User,
    @Res({ passthrough: true }) response: FastifyReply
  ) {
    await this.authService.deleteAccount(user.id);
    response.clearCookie('refreshToken', {
      path: '/api/v1/auth/refresh',
    });
    return { message: 'Account deleted successfully' };
  }

  // ============ CHANNEL BINDING (internal) ============

  /**
   * Resolve the Claimant behind a phone number a messaging platform has
   * verified belongs to the sender.
   *
   * Internal only, and deliberately so: find-or-create on a bare phone number
   * is a claimant-creation and enumeration oracle, and the only thing making
   * it safe is that the caller has the platform's own evidence — Telegram's
   * `contact.user_id` matching the sender. That check lives in the adapter,
   * where the evidence is; this route trusts it and says so.
   *
   * It exists because `claimant` is identity-context data that only this
   * service may write, which is also the recorded resolution for the
   * case-service → claimant ownership exception.
   */
  @Post('channel/resolve-claimant')
  @Public()
  @UseGuards(InternalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a claimant from a platform-verified phone (internal)' })
  async resolveChannelClaimant(@Body() dto: ResolveChannelClaimantDto) {
    const claimant = await this.claimantsService.findOrCreateByPhone(dto.phoneNumber);
    const tenantId = await this.claimantsService.getFirstTenantId(claimant.id);

    this.logger.log(
      `Channel binding: ${dto.channel} resolved a platform-verified number to claimant ${claimant.id}.`
    );
    return { claimantId: claimant.id, tenantId };
  }

  /**
   * Resolve a claimant from unverified intake contact details (internal).
   *
   * The sibling of the route above, and deliberately not the same one: that
   * one exists because a messaging platform vouched for the number, while
   * this one takes a phone parsed out of an email nobody authenticated. Both
   * may create a Claimant, because `claimant` is identity-context data only
   * this service may write — which is the whole point of the case-service →
   * claimant ownership exception this route retires. What differs is what the
   * record can later claim about how the contact was obtained.
   */
  @Post('intake/resolve-claimant')
  @Public()
  @UseGuards(InternalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resolve a claimant from unverified intake details (internal)' })
  async resolveIntakeClaimant(@Body() dto: ResolveIntakeClaimantDto) {
    const claimant = await this.claimantsService.findOrCreate({
      phoneNumber: dto.phoneNumber,
      fullName: dto.fullName,
    });
    const tenantId = await this.claimantsService.getFirstTenantId(claimant.id);

    this.logger.log(
      `Intake (${dto.source}): resolved an UNVERIFIED contact to claimant ${claimant.id}.`
    );
    return { claimantId: claimant.id, tenantId };
  }

  /**
   * Send a login code for a channel that cannot vouch for a phone number.
   *
   * WhatsApp and Telegram never reach here: the platform attests the number
   * (a WhatsApp message can only come from the account that sent it), so
   * `resolve-claimant` above is enough. A browser attests nothing, so web chat
   * asks for the number in the conversation and proves possession with a code.
   *
   * Internal-only, exactly like resolve-claimant and for the same reason: an
   * open send-a-code-to-any-number endpoint is both a claimant-enumeration
   * oracle and somebody else's phone ringing. The public surface is the
   * conversation, which is rate limited at the edge.
   */
  @Post('channel/send-code')
  @Public()
  @UseGuards(InternalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send a verification code for a channel binding (internal)' })
  async sendChannelCode(@Body() dto: { phoneNumber: string }) {
    // Delivered over the same WhatsApp business account the intake channel
    // uses — one number, one sender identity, no extra vendor.
    const result = await this.otpService.sendOtp(dto.phoneNumber);
    this.logger.log('Channel binding: verification code dispatched.');
    // The code itself is returned only where OtpService already allows it
    // (non-production); production returns the expiry alone.
    return { expiresIn: result.expiresIn, code: result.code };
  }

  /**
   * Check a code a claimant typed into the conversation.
   *
   * Returns a boolean rather than throwing onward: a wrong code is an ordinary
   * conversational turn, and the bot answers it with "that code did not match"
   * and the question again — not an HTTP error the channel would have to
   * translate back into speech.
   */
  @Post('channel/verify-code')
  @Public()
  @UseGuards(InternalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify a channel binding code (internal)' })
  async verifyChannelCode(@Body() dto: { phoneNumber: string; code: string }) {
    try {
      const verified = await this.otpService.verifyOtp(dto.phoneNumber, dto.code);
      return { verified };
    } catch {
      // OtpService throws for "no code outstanding" and "wrong code" alike.
      // Both mean the same thing to the claimant: try again.
      return { verified: false };
    }
  }

  // ============ CLAIMANT OTP AUTHENTICATION ============

  @Post('claimant/send-otp')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 3600000 } }) // 5 requests per hour
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send OTP to claimant phone number' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully',
    schema: {
      type: 'object',
      properties: {
        expiresIn: { type: 'number', example: 300 },
      },
    },
  })
  @ApiResponse({ status: 429, description: 'Too many requests' })
  @ApiResponse({ status: 400, description: 'Invalid phone number' })
  async sendOtp(@Body() dto: SendOtpDto) {
    const result = await this.otpService.sendOtp(dto.phoneNumber);
    return {
      message: result.code ? 'No SMS provider — code returned for testing' : 'OTP sent successfully',
      expiresIn: result.expiresIn,
      // Present only outside production, and only while no transport can
      // deliver. The service throws rather than populating this in production,
      // so there is no environment in which a live code is handed back to an
      // unauthenticated caller.
      ...(result.code ? { code: result.code } : {}),
    };
  }

  @Post('claimant/verify-otp')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify OTP and authenticate claimant' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified, tokens returned',
    schema: {
      type: 'object',
      properties: {
        user: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            phoneNumber: { type: 'string' },
            fullName: { type: 'string', nullable: true },
            kycStatus: { type: 'string' },
          },
        },
        tokens: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            expiresIn: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired OTP' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Res({ passthrough: true }) response: FastifyReply) {
    // Verify OTP
    await this.otpService.verifyOtp(dto.phoneNumber, dto.code);

    // Find or create claimant
    const claimant = await this.claimantsService.findOrCreateByPhone(dto.phoneNumber);

    // Get tenant ID for context
    const tenantId = await this.claimantsService.getFirstTenantId(claimant.id);

    // Generate JWT tokens for claimant
    const payload = {
      sub: claimant.id,
      phoneNumber: claimant.phoneNumber,
      role: 'CLAIMANT',
      tenantId,
    };

    const accessToken = this.jwtService.sign(payload, { expiresIn: 900 }); // 15 minutes
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    this.setRefreshTokenCookie(response, refreshToken);

    return {
      user: {
        id: claimant.id,
        phoneNumber: claimant.phoneNumber,
        fullName: claimant.fullName,
        kycStatus: claimant.kycStatus,
        tenantId, // Include in response as well
      },
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 900,
      },
    };
  }
}
