import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, Length } from 'class-validator';

export class VerifyOtpDto {
  @ApiProperty({
    example: '+60123456789',
    description: 'Phone number in international format (Malaysian)',
  })
  @IsString()
  @Matches(/^\+60[0-9]{9,10}$/, {
    message: 'Phone number must be a valid Malaysian number (e.g., +60123456789)',
  })
  phoneNumber!: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code',
  })
  @IsString()
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  @Matches(/^[0-9]{6}$/, { message: 'OTP code must contain only digits' })
  code!: string;
}
