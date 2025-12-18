import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    example: 'ahmad@adjustingfirm.com',
    description: 'User email address',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;

  @ApiProperty({
    example: 'SecureP@ss123',
    description: 'User password',
  })
  @IsString()
  @MinLength(1, { message: 'Password is required' })
  password!: string;
}
