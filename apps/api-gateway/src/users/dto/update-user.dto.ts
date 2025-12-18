import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';

export class UpdateUserDto {
  @ApiPropertyOptional({
    example: 'Ahmad bin Abdullah',
    description: 'Full name of the user',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({
    example: '+60123456789',
    description: 'Phone number in international format',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: 'Phone number must be in valid international format',
  })
  phoneNumber?: string;

  @ApiPropertyOptional({
    example: 'LA-2025-001234',
    description: 'License number (for adjusters)',
  })
  @IsOptional()
  @IsString()
  licenseNumber?: string;
}
