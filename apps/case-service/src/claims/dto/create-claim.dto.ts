import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsEnum,
  IsObject,
  IsOptional,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ClaimType {
  OWN_DAMAGE = 'OWN_DAMAGE',
  THIRD_PARTY_PROPERTY = 'THIRD_PARTY_PROPERTY',
  THEFT = 'THEFT',
  WINDSCREEN = 'WINDSCREEN',
}

export class IncidentLocationDto {
  @ApiProperty({ example: 'Jalan Bukit Bintang, KL' })
  @IsString()
  @IsNotEmpty()
  address!: string;

  @ApiPropertyOptional({ example: 3.1478 })
  @IsOptional()
  latitude?: number;

  @ApiPropertyOptional({ example: 101.7128 })
  @IsOptional()
  longitude?: number;
}

export class CreateClaimDto {
  @ApiProperty({ example: 'POL-2025-001234' })
  @IsString()
  @IsOptional()
  policyNumber?: string;

  @ApiProperty({ enum: ClaimType, example: ClaimType.OWN_DAMAGE })
  @IsEnum(ClaimType)
  claimType!: ClaimType;

  @ApiPropertyOptional({ example: '880101-12-1234' })
  @IsString()
  @IsOptional()
  nric?: string;

  @ApiProperty({ example: '2025-12-15' })
  @IsDateString()
  incidentDate!: string;

  @ApiProperty({ type: IncidentLocationDto })
  @IsObject()
  @ValidateNested()
  @Type(() => IncidentLocationDto)
  incidentLocation!: IncidentLocationDto;

  @ApiProperty({ example: 'Rear-ended at traffic light junction' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  description!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  claimantId!: string;

  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @ApiPropertyOptional({ example: 'W12345A' })
  @IsString()
  @IsOptional()
  vehiclePlateNumber?: string;

  @ApiPropertyOptional({ example: 'Perodua' })
  @IsString()
  @IsOptional()
  vehicleMake?: string;

  @ApiPropertyOptional({ example: 'Myvi' })
  @IsString()
  @IsOptional()
  vehicleModel?: string;

  @ApiPropertyOptional({ example: 'PMK123456789' })
  @IsString()
  @IsOptional()
  vehicleChassisNumber?: string;

  @ApiPropertyOptional({ example: 'ENG123456' })
  @IsString()
  @IsOptional()
  vehicleEngineNumber?: string;

  @ApiPropertyOptional({ example: 2025 })
  @IsOptional()
  vehicleYear?: number;

  @ApiPropertyOptional({ example: 0.55 })
  @IsOptional()
  ncdRate?: number;

  @ApiPropertyOptional({ example: 50000 })
  @IsOptional()
  sumInsured?: number;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  estimatedLossAmount?: number;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  sstAmount?: number;

  @ApiPropertyOptional({ example: 'POL/123/2025' })
  @IsString()
  @IsOptional()
  policeReportNumber?: string;

  @ApiPropertyOptional({ example: 'Balai Polis Travers' })
  @IsString()
  @IsOptional()
  policeStation?: string;

  @ApiPropertyOptional({ example: '2025-12-15' })
  @IsDateString()
  @IsOptional()
  policeReportDate?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  isPdpaCompliant?: boolean;
}
