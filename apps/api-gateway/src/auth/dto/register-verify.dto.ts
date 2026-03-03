import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, Length } from 'class-validator';

export class RegisterVerifyDto {
  @ApiProperty({
    example: 'user-uuid-here',
    description: 'User ID of the newly registered user',
  })
  @IsString()
  userId!: string;

  @ApiProperty({
    example: '123456',
    description: '6-digit OTP code',
  })
  @IsString()
  @Length(6, 6, { message: 'OTP code must be exactly 6 digits' })
  @Matches(/^[0-9]{6}$/, { message: 'OTP code must contain only digits' })
  code!: string;
}
