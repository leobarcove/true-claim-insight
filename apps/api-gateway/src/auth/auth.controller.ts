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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FastifyReply } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';

import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { ClaimantsService } from '../claimants/claimants.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
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
    this.setRefreshTokenCookie(response, result.tokens.refreshToken);
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
    this.setRefreshTokenCookie(response, result.tokens.refreshToken);
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
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      tenantId: user.tenantId,
      tenantName: user.tenant?.name,
    };
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
      message: 'OTP sent successfully',
      expiresIn: result.expiresIn,
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
