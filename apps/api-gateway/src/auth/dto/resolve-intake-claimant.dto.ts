import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Resolve a claimant from contact details **nobody has verified**.
 *
 * Deliberately a separate shape from `ResolveChannelClaimantDto`, whose whole
 * contract is that a messaging platform vouched for the number. This one
 * carries a phone scraped out of an FNOL email: it may be a typo, an agent's
 * own number, or absent from the claimant's record entirely. Reusing the
 * verified route would have logged an unverified contact as attested, and the
 * distinction is the sort that becomes load-bearing later — an identity gate
 * asks *how* a number was proved, not merely that one exists.
 */
export class ResolveIntakeClaimantDto {
  @ApiProperty({ example: '+60123456789' })
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneNumber must be an international number in E.164 form, e.g. +60123456789',
  })
  phoneNumber!: string;

  @ApiPropertyOptional({ example: 'Leo Boey' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  /** Where the contact came from, for the log — e.g. `FNOL_EMAIL`. */
  @ApiProperty({ example: 'FNOL_EMAIL' })
  @IsString()
  @MaxLength(40)
  source!: string;
}
