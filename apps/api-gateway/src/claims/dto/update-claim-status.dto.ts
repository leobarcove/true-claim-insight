import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ClaimStatus } from '@prisma/client';

/**
 * Body for `PATCH /claims/:id/status` at the edge.
 *
 * case-service validates this too. Rejecting it here as well means an invalid
 * status never travels across the internal hop at all, and the caller gets an
 * error naming the field rather than one relayed from a downstream service.
 */
export class UpdateClaimStatusDto {
  @ApiProperty({ enum: ClaimStatus, description: 'The status to move the claim to' })
  @IsEnum(ClaimStatus)
  status!: ClaimStatus;
}
