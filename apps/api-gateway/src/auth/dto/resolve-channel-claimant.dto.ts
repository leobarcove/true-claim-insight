import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches } from 'class-validator';

/**
 * A phone number a messaging platform has verified belongs to the sender.
 *
 * The channel is recorded rather than inferred: which platform vouched for a
 * number is part of how strong the binding is, and a later audit of "how did
 * we come to believe this was them?" needs it on the record.
 */
export class ResolveChannelClaimantDto {
  @ApiProperty({ example: '+60123456789' })
  @IsString()
  // Malaysian mobile in the forms people actually have, normalised by the
  // adapter before it gets here. Constrained rather than free text because
  // this route creates a Claimant if none exists.
  @Matches(/^(\+?60|0)\d{8,10}$/, { message: 'phoneNumber must be a Malaysian mobile number' })
  phoneNumber!: string;

  @ApiProperty({ example: 'TELEGRAM', enum: ['TELEGRAM', 'WHATSAPP', 'MESSENGER', 'WEB_CHAT'] })
  @IsIn(['TELEGRAM', 'WHATSAPP', 'MESSENGER', 'WEB_CHAT'])
  channel!: string;
}
