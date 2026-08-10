import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Manual policy entry — keyed in from insurer (MSIG) emails. */
export class CreatePolicyDto {
  @IsString()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  policyNumber!: string;

  @IsString()
  @IsNotEmpty()
  insuredName!: string;

  @IsOptional()
  @IsString()
  insuredNric?: string;

  @IsOptional()
  @IsString()
  insuredPhone?: string;

  @IsOptional()
  @IsString()
  planTier?: string;

  @IsOptional()
  @IsDateString()
  tripStartDate?: string;

  @IsOptional()
  @IsDateString()
  tripEndDate?: string;

  @IsOptional()
  @IsString()
  destination?: string;
}
