import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { ClaimantsService } from '../claimants/claimants.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string;
  email?: string;
  role: string;
  tenantId: string | null; // Deprecated: for backward compatibility
  currentTenantId: string | null; // Active tenant context
  tenantIds?: string[]; // All tenants user has access to
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: string;
    phoneNumber: string;
    licenseNumber?: string | null;
    tenantId: string | null;
    currentTenantId: string | null;
    tenantName: string;
  };
  userTenants: Array<{
    tenantId: string;
    tenantName: string;
    role: string;
    isDefault: boolean;
    status: string;
  }>;
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly claimantsService: ClaimantsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = this.configService.get<number>('bcrypt.saltRounds', 12);
    const hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
    });

    const tokens = await this.generateTokens(user);
    const userTenants = await this.getUserTenants(user.id);

    this.logger.log(`User registered: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
        licenseNumber: user.licenseNumber || (user as any).adjuster?.licenseNumber,
        tenantId: user.tenantId,
        currentTenantId: (user as any).currentTenantId || user.tenantId,
        tenantName: (user as any).tenant?.name || (user as any).currentTenant?.name || '',
      },
      userTenants,
      tokens,
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update last login
    await this.usersService.updateLastLogin(user.id);

    const tokens = await this.generateTokens(user);
    const userTenants = await this.getUserTenants(user.id);

    this.logger.log(`User logged in: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
        licenseNumber: user.licenseNumber || (user as any).adjuster?.licenseNumber,
        tenantId: user.tenantId,
        currentTenantId: (user as any).currentTenantId || user.tenantId,
        tenantName: (user as any).tenant?.name || (user as any).currentTenant?.name || '',
      },
      userTenants,
      tokens,
    };
  }

  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    if (!user) {
      return null;
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return null;
    }

    return user;
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    try {
      const payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.secret'),
      });

      const user = await this.usersService.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new token pair
      return this.generateTokens(user);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, (user as any).password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    const saltRounds = this.configService.get<number>('bcrypt.saltRounds', 12);
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await this.usersService.updatePassword(userId, hashedPassword);
    this.logger.log(`Password changed for user: ${user.email}`);
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.usersService.delete(userId);
    this.logger.log(`Account deleted: ${userId}`);
  }

  async validateJwtPayload(payload: JwtPayload) {
    if (payload.role === 'CLAIMANT') {
      const claimant = await this.claimantsService.findById(payload.sub);
      if (!claimant) {
        throw new UnauthorizedException('Claimant not found');
      }
      return { ...claimant, role: 'CLAIMANT', tenantId: payload.tenantId };
    }

    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async switchTenant(
    userId: string,
    tenantId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResponse> {
    // Verify user has access to this tenant
    const userTenant = await this.usersService.getUserTenant(userId, tenantId);
    if (!userTenant || userTenant.status !== 'ACTIVE') {
      throw new UnauthorizedException('You do not have access to this tenant');
    }

    const user = await this.usersService.updateCurrentTenant(userId, tenantId);
    await this.usersService.logTenantAccess(
      userId,
      (user as any).currentTenantId,
      tenantId,
      ipAddress,
      userAgent
    );

    const tokens = await this.generateTokens(user);
    const userTenants = await this.getUserTenants(user.id);
    this.logger.log(`User ${user.email} switched to tenant ${tenantId}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
        licenseNumber: user.licenseNumber || (user as any).adjuster?.licenseNumber,
        tenantId: user.tenantId,
        currentTenantId: (user as any).currentTenantId,
        tenantName: (user as any).currentTenant?.name || '',
      },
      userTenants,
      tokens,
    };
  }

  async getUserTenants(userId: string) {
    return this.usersService.getUserTenants(userId);
  }

  private async generateTokens(user: {
    id: string;
    email?: string;
    role: string;
    tenantId: string | null;
    currentTenantId?: string | null;
    userTenants?: any[];
  }): Promise<TokenPair> {
    // Get all tenant IDs if not provided
    const userTenants = user.userTenants || (await this.getUserTenants(user.id));
    const tenantIds = userTenants.map((ut: any) => ut.tenantId);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      currentTenantId: user.currentTenantId || user.tenantId,
      tenantIds,
    };

    const accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn', '15m');
    const refreshExpiresIn = this.configService.get<string>('jwt.refreshExpiresIn', '7d');

    const accessExpiresInSeconds = this.parseTimeToSeconds(accessExpiresIn);
    const refreshExpiresInSeconds = this.parseTimeToSeconds(refreshExpiresIn);

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: accessExpiresInSeconds,
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: refreshExpiresInSeconds,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresInSeconds,
    };
  }

  private parseTimeToSeconds(time: string): number {
    const unit = time.slice(-1);
    const value = parseInt(time.slice(0, -1), 10);

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 60 * 60 * 24;
      default:
        return 900; // 15 minutes default
    }
  }
}
