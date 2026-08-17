import { IsIn, IsNotEmpty, IsNumberString, IsOptional, IsString } from 'class-validator';
import { CaseChannel, CaseStatus, TravelClaimType } from '@prisma/client';

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

/**
 * Queue listing filters.
 *
 * The enum fields validate against the Prisma enums rather than accepting any
 * string: the browser now writes these into the address bar, which makes them
 * a surface a person can edit by hand. An invalid value used to reach Prisma
 * as a blind cast and surface as a 500; a filter that names no real status
 * deserves a 400 that says so.
 */
export class CaseQueryDto {
  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsIn(Object.values(CaseStatus))
  status?: string;

  @IsOptional()
  @IsIn(Object.values(TravelClaimType))
  travelClaimType?: string;

  @IsOptional()
  @IsIn(Object.values(CaseChannel))
  channel?: string;

  @IsOptional()
  @IsString()
  search?: string;
}
