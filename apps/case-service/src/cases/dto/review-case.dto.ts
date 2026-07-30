import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Operator note attached to request-info / refer-expert / reject actions. */
export class ReviewCaseDto {
  @IsString()
  @IsNotEmpty()
  note!: string;
}

export class LinkPolicyDto {
  @IsString()
  @IsNotEmpty()
  policyId!: string;
}

export class CaseQueryDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  travelClaimType?: string;

  @IsOptional()
  @IsString()
  channel?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
