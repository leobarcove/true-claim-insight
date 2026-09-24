import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';

/**
 * Self-registration. Deliberately carries no role and no tenant: a person
 * registers, an organisation grants access. See AuthService.register.
 */
export class RegisterDto {
  @ApiProperty({
    example: 'ahmad@adjustingfirm.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({
    example: 'SecureP@ss123',
    description: 'Password (min 8 chars, must include uppercase, lowercase, number)',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/, {
    message: 'Password must contain uppercase, lowercase, and number',
  })
  password!: string;

  @ApiProperty({
    example: 'Ahmad bin Abdullah',
    description: 'Full name of the user',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName!: string;

  @ApiProperty({
    example: '+60123456789',
    description: 'Phone number in international format',
  })
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be in valid international format',
  })
  phoneNumber!: string;

  @ApiPropertyOptional({
    example: 'LA-2025-001234',
    description: 'License number (required for adjusters)',
  })
  @IsOptional()
  @IsString()
  licenseNumber?: string;
}
