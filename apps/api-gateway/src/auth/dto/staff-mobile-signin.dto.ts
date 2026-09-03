import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

/**
 * Staff sign-in for the agent-assisted form: their own mobile, a WhatsApp code,
 * no password.
 *
 * The number is the *agent's*, never the claimant's — the screen says so,
 * because the very next one asks for the claimant's. Same E.164 rule as every
 * other number in the system, and deliberately not Malaysia-only: staff travel
 * and roam, and a pattern that refused a foreign handset would lock someone out
 * of their own account with a 400 that reads as a bug.
 */
export class StaffSendCodeDto {
  @ApiProperty({ example: '999999-00' })
  @IsString()
  @Matches(/^\d{6}-\d{2}$/, {
    message: 'registrationNumber must use the format 999999-00',
  })
  registrationNumber!: string;

  @ApiProperty({ example: '+60129876543' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneNumber must be an international number in E.164 form, e.g. +60129876543',
  })
  phoneNumber!: string;
}

export class StaffVerifyCodeDto {
  @ApiProperty({ example: '999999-00' })
  @IsString()
  @Matches(/^\d{6}-\d{2}$/, {
    message: 'registrationNumber must use the format 999999-00',
  })
  registrationNumber!: string;

  @ApiProperty({ example: '+60129876543' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneNumber must be an international number in E.164 form, e.g. +60129876543',
  })
  phoneNumber!: string;

  @ApiProperty({ example: '482913' })
  @IsString()
  @Length(6, 6, { message: 'The code is six digits.' })
  code!: string;

  /**
   * "Keep me signed in on this device for 30 days."
   *
   * Buys a longer *refresh* token, not a longer grant: the access token still
   * expires in minutes and every renewal re-reads the account. Without it an
   * agent taking claims by phone all day meets two sign-in screens per claim,
   * which is the friction that ruled out a password screen to begin with.
   */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  keepSignedIn?: boolean;
}
