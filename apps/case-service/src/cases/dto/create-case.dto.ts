import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
import { CaseChannel, CaseInitiator, TravelClaimType } from '@prisma/client';

/**
 * Payload to create a pre-claim intake Case.
 *
 * Claimant self-serve (WEB_CHAT): claimant identity comes from the JWT
 * (gateway forwards it); answers start empty and are patched step by step.
 *
 * Staff capture (STAFF / EMAIL): staff supply the claimant's phone (the
 * natural key) and optionally the full answer set from the one-page form.
 */
export class CreateCaseDto {
  @IsEnum(TravelClaimType)
  travelClaimType!: TravelClaimType;

  @IsOptional()
  @IsEnum(CaseChannel)
  channel?: CaseChannel;

  @IsOptional()
  @IsEnum(CaseInitiator)
  initiatedBy?: CaseInitiator;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  claimantId?: string;

  @IsOptional()
  @IsString()
  claimantPhone?: string;

  @IsOptional()
  @IsString()
  claimantFullName?: string;

  @IsOptional()
  @IsString()
  claimantNric?: string;

  /** Pre-filled answers (staff form or future SYSTEM-initiated cases). */
  @IsOptional()
  @IsObject()
  answers?: Record<string, string | number | boolean>;

  /** EMAIL channel provenance: { from, subject, receivedAt }. */
  @IsOptional()
  @IsObject()
  sourceMeta?: Record<string, unknown>;
}
