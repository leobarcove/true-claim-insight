import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FloodSource, PropertyType } from '@prisma/client';

/**
 * Payload to create a flood claim. Combines core Claim fields with flood-
 * specific sub-table fields. The service splits them across `Claim` and
 * `FloodClaim` tables on create.
 */
export class CreateFloodClaimDto {
  // --- Core claim fields ---
  @IsString()
  @IsNotEmpty()
  claimantId!: string;

  @IsOptional()
  @IsString()
  nric?: string;

  @IsString()
  @IsNotEmpty()
  policyNumber!: string;

  @IsDateString()
  incidentDate!: string;

  @IsObject()
  incidentLocation!: Record<string, unknown>;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsBoolean()
  isPdpaCompliant?: boolean;

  // --- Flood-specific (FloodClaim sub-table) ---
  @IsDateString()
  incidentStart!: string;

  @IsOptional()
  @IsDateString()
  incidentEnd?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  waterDepthCm?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  durationHours?: number;

  @IsOptional()
  @IsEnum(FloodSource)
  source?: FloodSource;

  @IsOptional()
  @IsEnum(PropertyType)
  propertyType?: PropertyType;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  propertyFloorLevel?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  propertyElevationMeters?: number;

  @IsOptional()
  @IsString()
  postcode?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  buildingDamageRm?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  contentsDamageRm?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  vehicleDamageRm?: number;
}
