import { Injectable, UnauthorizedException, ConflictException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { UsersService } from '../users/users.service';
import { ClaimantsService } from '../claimants/claimants.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { OtpService } from './otp.service';
import { AuditService } from '../common/audit/audit.service';

export interface JwtPayload {
  sub: string;
  email?: string;
  role: string;
  tenantId: string | null; // Deprecated: for backward compatibility
  currentTenantId: string | null; // Active tenant context
  tenantIds?: string[]; // All tenants user has access to
  identityType?: 'PIAM_AGENT';
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
    avatarUrl?: string | null;
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
  tokens?: TokenPair;
  requiresVerification?: boolean;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly claimantsService: ClaimantsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly audit: AuditService
  ) {}
  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    // Check if user already exists
    const existingUser = await this.usersService.findByEmail(registerDto.email);
    if (existingUser) {
      if (!(existingUser as any).isVerified) {
        // Trigger OTP and return verification status
        await this.otpService.sendOtp(existingUser.phoneNumber, undefined, existingUser.id);
        const userTenants = await this.getUserTenants(existingUser.id);
        const defaultTenant = userTenants.find(ut => ut.isDefault);
        const activeTenantId =
          defaultTenant?.tenantId || (existingUser as any).currentTenantId || existingUser.tenantId;

        const activeTenantName =
          userTenants.find(ut => ut.tenantId === activeTenantId)?.tenantName ||
          (existingUser as any).tenant?.name ||
          '';

        return {
          user: {
            id: existingUser.id,
            email: existingUser.email,
            fullName: existingUser.fullName,
            role: existingUser.role,
            phoneNumber: existingUser.phoneNumber,
            licenseNumber:
              existingUser.licenseNumber || (existingUser as any).adjuster?.licenseNumber,
            avatarUrl: (existingUser as any).avatarUrl,
            tenantId: existingUser.tenantId,
            currentTenantId: activeTenantId,
            tenantName: activeTenantName,
          },
          userTenants,
          requiresVerification: true,
        };
      }
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = this.configService.get<number>('bcrypt.saltRounds', 12);
    const hashedPassword = await bcrypt.hash(registerDto.password, saltRounds);
    const user = await this.usersService.create({
      ...registerDto,
      password: hashedPassword,
      isVerified: false,
    } as any);

    const userTenants = await this.getUserTenants(user.id);
    const defaultTenant = userTenants.find(ut => ut.isDefault);
    const activeTenantId = defaultTenant?.tenantId || user.currentTenantId || user.tenantId;

    const activeTenantName =
      userTenants.find(ut => ut.tenantId === activeTenantId)?.tenantName ||
      (user as any).tenant?.name ||
      '';

    // Send verification OTP
    await this.otpService.sendOtp(user.phoneNumber, undefined, user.id);

    this.logger.log(`User registered and OTP sent: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
        licenseNumber: user.licenseNumber || (user as any).adjuster?.licenseNumber,
        avatarUrl: (user as any).avatarUrl,
        tenantId: user.tenantId,
        currentTenantId: activeTenantId,
        tenantName: activeTenantName,
      },
      userTenants,
      requiresVerification: true,
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    const user = await this.validateUser(loginDto.email, loginDto.password);

    if (!user) {
      // A failed sign-in is security evidence, so it is recorded — but against
      // the attempted email only. The password never reaches the audit trail,
      // which is append-only and therefore impossible to redact afterwards.
      await this.audit.record({
        entityType: 'AUTH',
        entityId: loginDto.email,
        action: 'LOGIN_FAILED',
        metadata: { reason: 'invalid credentials' },
      });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!(user as any).isVerified) {
      // Send a new OTP if login is attempted for an unverified account
      await this.otpService.sendOtp(user.phoneNumber, undefined, user.id);
      throw new UnauthorizedException({
        message: 'Account not verified. A new verification code has been sent to your phone.',
        requiresVerification: true,
        userId: user.id,
        phoneNumber: user.phoneNumber,
      });
    }

    // Update last login
    await this.usersService.updateLastLogin(user.id);

    const userTenants = await this.getUserTenants(user.id);

    // Prioritize isDefault tenant
    const defaultTenant = userTenants.find(ut => ut.isDefault);
    const activeTenantId =
      defaultTenant?.tenantId || (user as any).currentTenantId || user.tenantId;

    const tokens = await this.generateTokens({ ...user, currentTenantId: activeTenantId });

    const activeTenantName =
      userTenants.find(ut => ut.tenantId === activeTenantId)?.tenantName ||
      (user as any).tenant?.name ||
      (user as any).currentTenant?.name ||
      '';

    await this.audit.record({
      entityType: 'AUTH',
      entityId: user.id,
      action: 'LOGIN_SUCCEEDED',
      actorId: user.id,
      userId: user.id,
      tenantId: activeTenantId ?? null,
      metadata: { role: user.role },
    });

    this.logger.log(`User logged in: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
        licenseNumber: user.licenseNumber || (user as any).adjuster?.licenseNumber,
        avatarUrl: (user as any).avatarUrl,
        tenantId: user.tenantId,
        currentTenantId: activeTenantId,
        tenantName: activeTenantName,
      },
      userTenants,
      tokens,
    };
  }

  /**
   * Staff sign-in, step one: send a code to the number on their own account.
   *
   * The agent-assisted form has no password on it — the whole claimant-facing
   * product has none, and adding one there would have created the only
   * password in it, to be leaked, reset and shared between colleagues. So an
   * agent proves the same thing a claimant proves, about their own handset,
   * through the same WhatsApp transport.
   *
   * **Answers the same way whether or not the number is known.** A staff
   * directory is worth having: "is this person one of yours?" is the first
   * question anyone phishing an adjusting firm would like answered, and a
   * response that varied would answer it for free. The refusal, if there is
   * one, happens at verify — where it costs an attacker a code they cannot
   * obtain rather than a single request.
   */
  async staffSendCode(
    registrationNumber: string,
    phoneNumber: string
  ): Promise<{ expiresIn: number; code?: string }> {
    const registeredAgent = await this.usersService.findPiamRegisteredAgent(
      registrationNumber,
      phoneNumber
    );

    if (!registeredAgent || !registeredAgent.tenantId) {
      await this.audit.record({
        entityType: 'AUTH',
        entityId: phoneNumber,
        action: 'STAFF_CODE_REQUESTED_UNKNOWN_NUMBER',
        metadata: { reason: 'registration/phone mismatch or no matching insurer tenant' },
      });
      throw new UnauthorizedException('Registration number or mobile number not recognised.');
    }

    const result = await this.otpService.sendOtp(phoneNumber);
    this.logger.log(`PIAM agent sign-in: code dispatched for agent ${registeredAgent.id}.`);
    return { expiresIn: result.expiresIn, code: result.code };
  }

  /**
   * Staff sign-in, step two: the code, and a session that survives the week.
   *
   * `keepSignedIn` buys a 30-day *refresh* token, not a 30-day grant — the
   * access token still expires in minutes and every renewal re-reads the
   * account, so revoking someone still takes effect within that window. Without
   * it an agent taking claims by phone all day would meet two OTP screens per
   * claim, which is the friction that ruled out a password screen in the first
   * place.
   */
  async staffVerifyCode(
    registrationNumber: string,
    phoneNumber: string,
    code: string,
    keepSignedIn = false
  ): Promise<AuthResponse> {
    const registeredAgent = await this.usersService.findPiamRegisteredAgent(
      registrationNumber,
      phoneNumber
    );

    // Verified before the account is checked, so a wrong code and an unknown
    // number are indistinguishable from outside — see staffSendCode.
    let verified = false;
    try {
      verified = Boolean(await this.otpService.verifyOtp(phoneNumber, code));
    } catch {
      verified = false;
    }

    if (!verified || !registeredAgent || !registeredAgent?.tenantId) {
      await this.audit.record({
        entityType: 'AUTH',
        entityId: phoneNumber,
        action: 'STAFF_LOGIN_FAILED',
        metadata: { reason: verified ? 'invalid PIAM agent identity' : 'invalid or expired code' },
      });
      throw new UnauthorizedException('That code did not match. Please try again.');
    }

    const activeTenantId = registeredAgent.tenantId;
    const userTenants = [
      {
        tenantId: activeTenantId,
        tenantName: registeredAgent.tenantName ?? registeredAgent.agencyName,
        role: 'ADJUSTER',
        isDefault: true,
        status: 'ACTIVE',
      },
    ];

    const tokens = await this.generateTokens(
      {
        id: registeredAgent.id,
        role: 'ADJUSTER',
        tenantId: activeTenantId,
        currentTenantId: activeTenantId,
        userTenants,
        identityType: 'PIAM_AGENT',
      },
      keepSignedIn ? '30d' : undefined
    );

    await this.audit.record({
      entityType: 'AUTH',
      entityId: registeredAgent.id,
      action: 'STAFF_LOGIN_SUCCEEDED',
      actorId: registeredAgent.id,
      tenantId: activeTenantId ?? null,
      metadata: { role: 'ADJUSTER', method: 'mobile-code', keepSignedIn },
    });

    this.logger.log(`PIAM agent signed in by mobile: ${registeredAgent.id}`);

    return {
      user: {
        id: registeredAgent.id,
        email: '',
        fullName:
          registeredAgent.agentName ?? registeredAgent.tenantName ?? registeredAgent.agencyName,
        role: 'ADJUSTER',
        phoneNumber: `+${registeredAgent.phoneNumber.replace(/^\+/, '')}`,
        licenseNumber: registeredAgent.registrationNumber,
        avatarUrl: null,
        tenantId: activeTenantId,
        currentTenantId: activeTenantId,
        tenantName: registeredAgent.tenantName ?? registeredAgent.agencyName,
      },
      userTenants,
      tokens,
    };
  }

  async verifyRegistration(userId: string, code: string): Promise<AuthResponse> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Verify OTP
    await this.otpService.verifyOtp(user.phoneNumber, code);
    await this.usersService.setVerified(user.id, true);

    // After verification, generate tokens
    const userTenants = await this.getUserTenants(user.id);
    const defaultTenant = userTenants.find(ut => ut.isDefault);
    const activeTenantId =
      defaultTenant?.tenantId || (user as any).currentTenantId || user.tenantId;

    const tokens = await this.generateTokens({ ...user, currentTenantId: activeTenantId });

    const activeTenantName =
      userTenants.find(ut => ut.tenantId === activeTenantId)?.tenantName ||
      (user as any).tenant?.name ||
      (user as any).currentTenant?.name ||
      '';

    this.logger.log(`User verification successful: ${user.email}`);

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
        licenseNumber: user.licenseNumber || (user as any).adjuster?.licenseNumber,
        avatarUrl: (user as any).avatarUrl,
        tenantId: user.tenantId,
        currentTenantId: activeTenantId,
        tenantName: activeTenantName,
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

      if (payload.identityType === 'PIAM_AGENT') {
        const agent = await this.usersService.findPiamRegisteredAgentById(payload.sub);
        if (!agent) throw new UnauthorizedException('PIAM agent not found');
        return this.generateTokens({
          id: agent.id,
          role: 'ADJUSTER',
          tenantId: agent.tenantId,
          currentTenantId: agent.tenantId,
          identityType: 'PIAM_AGENT',
          userTenants: [{ tenantId: agent.tenantId }],
        });
      }

      const user = await this.usersService.findById(payload.sub);

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate new token pair
      return this.generateTokens({
        ...user,
        currentTenantId: payload.currentTenantId,
      });
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
    if (payload.identityType === 'PIAM_AGENT') {
      const agent = await this.usersService.findPiamRegisteredAgentById(payload.sub);
      if (!agent) throw new UnauthorizedException('PIAM agent not found');

      /*
        A registration with no tenant linked is not an unknown identity.

        This threw 401 as well, and the tenant was resolved by matching
        `agencyName` against `tenants.name` — a string from PIAM's register
        against one of ours. A rename on either side signed every agent of that
        agency out of a system that still showed them signed in, and reported it
        as an authentication failure, which sends whoever debugs it looking at
        tokens rather than at a name that no longer matches.

        The link is stored now, so a null means the agency has not been onboarded
        as a tenant. The identity stands; the tenant guard refuses the work,
        where the refusal can say what is actually wrong.
      */
      if (!agent.tenantId) {
        this.logger.warn(
          `PIAM agent ${agent.id} (${agent.registrationNumber}) has no tenant linked — ` +
            `"${agent.agencyName}" is not onboarded, so every case will be refused.`
        );
      }

      return {
        id: agent.id,
        fullName: agent.agentName ?? agent.tenantName ?? agent.agencyName,
        phoneNumber: `+${agent.phoneNumber.replace(/^\+/, '')}`,
        licenseNumber: agent.registrationNumber,
        role: 'ADJUSTER',
        tenantId: agent.tenantId,
        currentTenantId: agent.tenantId,
        tenantName: agent.tenantName ?? agent.agencyName,
        tenantIds: [agent.tenantId],
        identityType: 'PIAM_AGENT',
      };
    }

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

    // Attach multi-tenant context from payload
    return {
      ...user,
      currentTenantId: payload.currentTenantId,
      tenantIds:
        payload.tenantIds || (user as any).userTenants?.map((ut: any) => ut.tenantId) || [],
    };
  }

  async switchTenant(
    userId: string,
    tenantId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuthResponse> {
    const userRecord = await this.usersService.findById(userId);
    if (!userRecord) {
      throw new UnauthorizedException('User not found');
    }

    // Verify user has access to this tenant, unless they are a SUPER_ADMIN
    if (userRecord.role !== 'SUPER_ADMIN') {
      const userTenant = await this.usersService.getUserTenant(userId, tenantId);
      if (!userTenant || userTenant.status !== 'ACTIVE') {
        throw new UnauthorizedException('You do not have access to this tenant');
      }
    }

    const previousTenantId = userRecord.currentTenantId;
    const user = await this.usersService.updateCurrentTenant(userId, tenantId);
    await this.usersService.logTenantAccess(
      userId,
      previousTenantId,
      tenantId,
      ipAddress,
      userAgent
    );

    const updatedUser = {
      ...user,
      currentTenantId: tenantId,
    };

    const tokens = await this.generateTokens(updatedUser);
    const userTenants = await this.getUserTenants(user.id);
    this.logger.log(`User ${user.email} switched to tenant ${tenantId}`);

    return {
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        role: updatedUser.role,
        phoneNumber: updatedUser.phoneNumber,
        licenseNumber: updatedUser.licenseNumber || (updatedUser as any).adjuster?.licenseNumber,
        avatarUrl: (updatedUser as any).avatarUrl,
        tenantId: updatedUser.tenantId,
        currentTenantId: tenantId,
        tenantName: (user as any).currentTenant?.name || '',
      },
      userTenants,
      tokens,
    };
  }

  async getUserTenants(userId: string) {
    return this.usersService.getUserTenants(userId);
  }

  private async generateTokens(
    user: {
      id: string;
      email?: string;
      role: string;
      tenantId: string | null;
      currentTenantId?: string | null;
      userTenants?: any[];
      identityType?: 'PIAM_AGENT';
    },
    /**
     * How long the refresh token lives, overriding `jwt.refreshExpiresIn`.
     *
     * Only the agent-assisted form's "keep me signed in" passes one. An agent
     * fills in claims on the phone all day, and a session that expired at the
     * portal's cadence would put two OTP screens in front of every claim —
     * which is exactly the friction that made a password screen unacceptable.
     * The access token is unchanged: it still expires in minutes, so a
     * long-lived *refresh* is not a long-lived grant.
     */
    refreshExpiresInOverride?: string
  ): Promise<TokenPair> {
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
      identityType: user.identityType,
    };

    const accessExpiresIn = this.configService.get<string>('jwt.accessExpiresIn', '15m');
    const refreshExpiresIn =
      refreshExpiresInOverride ?? this.configService.get<string>('jwt.refreshExpiresIn', '7d');

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
