import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ description: 'ID of the claim this session is for' })
  @IsString()
  claimId!: string;

  @ApiPropertyOptional({ description: 'Scheduled start time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  scheduledTime?: string;
}

export class JoinRoomDto {
  @ApiProperty({ description: 'User ID joining the room' })
  @IsString()
  userId!: string;

  @ApiProperty({
    description: 'Role of the user joining',
    enum: ['CLAIMANT', 'ADJUSTER'],
  })
  @IsEnum(['CLAIMANT', 'ADJUSTER'])
  role!: 'CLAIMANT' | 'ADJUSTER';
}

export class EndRoomDto {
  @ApiPropertyOptional({ description: 'Reason for ending the session' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class SaveClientInfoDto {
  @ApiPropertyOptional()
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipv4?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ipv6?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userAgent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  browser?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  platform?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  screenResolution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  isp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organisation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  asn?: string;
}
