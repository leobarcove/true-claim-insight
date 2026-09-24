import { IsBoolean, IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
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

  /**
   * Route this case the way a claimant's own would be routed.
   *
   * Set by the agent-assisted form. Without it a staff-created case lands in
   * the *creator's* organisation, so the identical claim for the identical
   * person ends up in a different queue depending on who typed it — and an
   * insurer's agent filling one in drops it into the insurer's own queue, where
   * the adjusters who do the work cannot see it.
   *
   * An expression of intent, not a permission: it says "this is a claimant's
   * claim, entered by me", and routing then resolves the handling adjusting
   * firm from the matched policy exactly as self-service does. It cannot widen
   * access — `isAdjustingFirm` still refuses anything that is not one, and the
   * creator's own sight of the case is governed separately by `assertAccess`.
   */
  @IsOptional()
  @IsBoolean()
  routeAsClaimant?: boolean;
}
