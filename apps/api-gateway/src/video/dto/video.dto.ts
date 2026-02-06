import { IsString, IsNotEmpty, IsEnum, IsOptional } from 'class-validator';
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

export class SaveClientInfoDto {
  @IsOptional()
  latitude?: number;

  @IsOptional()
  longitude?: number;

  @IsOptional()
  @IsString()
  ipAddress?: string;

  @IsOptional()
  @IsString()
  ipv4?: string;

  @IsOptional()
  @IsString()
  ipv6?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  browser?: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsString()
  screenResolution?: string;

  @IsOptional()
  @IsString()
  timezone?: string;
}
