import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  IsNumber,
  IsBoolean,
  IsDateString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IncidentLocationDto } from './create-claim.dto';

export class UpdateClaimDto {
  @ApiPropertyOptional({ example: 'Updated description of the incident' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: IncidentLocationDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => IncidentLocationDto)
  incidentLocation?: IncidentLocationDto;

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

  @ApiPropertyOptional({ example: 'Ah Keong Workshop' })
  @IsString()
  @IsOptional()
  workshopName?: string;

  @ApiPropertyOptional({ example: 2500.50 })
  @IsNumber()
  @IsOptional()
  estimatedRepairCost?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isPdpaCompliant?: boolean;

  @ApiPropertyOptional({ example: '2025-12-25' })
  @IsDateString()
  @IsOptional()
  slaDeadline?: string;
}
