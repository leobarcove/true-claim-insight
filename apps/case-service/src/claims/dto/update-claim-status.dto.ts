import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ClaimStatus } from '@prisma/client';

/**
 * Body for `PATCH /claims/:id/status`.
 *
 * The endpoint previously took `@Body('status') status: string` with no
 * validation at all. It was safe only by accident: the transition lookup fell
 * back to an empty list for an unrecognised value, so nonsense was refused as
 * an invalid transition rather than as an invalid status. Once the transition
 * table became exhaustively typed that fallback went away, and an unvalidated
 * string would have thrown on `undefined.includes` — a 500 where a 400 belongs.
 *
 * Validating here also means the error names the problem ("status must be one
 * of …") instead of reporting a transition failure from a status that does not
 * exist.
 */
export class UpdateClaimStatusDto {
  @ApiProperty({ enum: ClaimStatus, description: 'The status to move the claim to' })
  @IsEnum(ClaimStatus)
  status!: ClaimStatus;
}
