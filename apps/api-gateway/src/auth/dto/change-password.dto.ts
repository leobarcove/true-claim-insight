import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'OldP@ss123',
    description: 'Current password',
  })
  @IsString()
  currentPassword!: string;

  @ApiProperty({
    example: 'NewSecureP@ss456',
    description: 'New password (min 8 chars, must include uppercase, lowercase, number)',
  })
  @IsString()
  @MinLength(8, { message: 'New password must be at least 8 characters' })
  @MaxLength(100)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/, {
    message: 'New password must contain uppercase, lowercase, and number',
  })
  newPassword!: string;
}
