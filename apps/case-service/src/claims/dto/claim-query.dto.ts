import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsInt, Min, Max, IsString, IsUUID, IsEnum, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export enum ClaimStatus {
  SUBMITTED = 'SUBMITTED',
  ASSIGNED = 'ASSIGNED',
  SCHEDULED = 'SCHEDULED',
  IN_ASSESSMENT = 'IN_ASSESSMENT',
  REPORT_PENDING = 'REPORT_PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ESCALATED_SIU = 'ESCALATED_SIU',
  CLOSED = 'CLOSED',
}

export class ClaimQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ClaimStatus })
  @IsOptional()
  @IsEnum(ClaimStatus)
  status?: ClaimStatus;

  @ApiPropertyOptional({ example: 'OWN_DAMAGE' })
  @IsOptional()
  @IsString()
  claimType?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsOptional()
  @IsUUID()
  adjusterId?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440002' })
  @IsOptional()
  @IsUUID()
  claimantId?: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440001' })
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @ApiPropertyOptional({ example: 'CLM-2025' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    example: 'createdAt',
    description: 'Field to sort by',
    enum: [
      'createdAt',
      'updatedAt',
      'claimNumber',
      'status',
      'priority',
      'scheduledAssessmentTime',
    ],
  })
  @IsOptional()
  @IsString()
  @IsIn(['createdAt', 'updatedAt', 'claimNumber', 'status', 'priority', 'scheduledAssessmentTime'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    example: 'desc',
    description: 'Sort order',
    enum: ['asc', 'desc'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';

  @ApiPropertyOptional({ example: '2025-01-01T00:00:00Z' })
  @IsOptional()
  @IsString()
  scheduledFrom?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  hasAnalysis?: boolean;
}
