import { IsString, IsNotEmpty, IsEnum, IsOptional, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ example: 'clm-123456' })
  @IsString()
  @IsNotEmpty()
  claimId!: string;

  @ApiProperty({ example: '2025-12-18T10:00:00Z', required: false })
  @IsString()
  @IsOptional()
  scheduledTime?: string;
}

export class JoinRoomDto {
  @ApiProperty({ example: 'user-123' })
  @IsString()
  @IsNotEmpty()
  userId!: string;

  @ApiProperty({ enum: ['ADJUSTER', 'CLAIMANT'] })
  @IsEnum(['ADJUSTER', 'CLAIMANT'])
  role!: 'ADJUSTER' | 'CLAIMANT';
}

export class EndRoomDto {
  @ApiProperty({ example: 'Assessment completed', required: false })
  @IsString()
  @IsOptional()
  reason?: string;
}
