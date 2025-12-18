import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class SendOtpDto {
  @ApiProperty({
    example: '+60123456789',
    description: 'Phone number in international format (Malaysian)',
  })
  @IsString()
  @Matches(/^\+60[0-9]{9,10}$/, {
    message: 'Phone number must be a valid Malaysian number (e.g., +60123456789)',
  })
  phoneNumber!: string;
}
