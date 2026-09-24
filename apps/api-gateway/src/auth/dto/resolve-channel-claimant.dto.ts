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
  // E.164, normalised by the adapter before it gets here. Constrained rather
  // than free text because this route creates a Claimant if none exists.
  //
  // Not Malaysia-only: the pattern was `^(\+?60|0)\d{8,10}$`, which refused
  // every foreign number — on the one line whose claimants are, by definition,
  // abroad. A travel claimant with a Singaporean or British handset could not
  // bind at all, and the 400 would have read as a bug in the bot.
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phoneNumber must be an international number in E.164 form, e.g. +60123456789',
  })
  phoneNumber!: string;

  /**
   * An allow-list, not a mirror of `CaseChannel`. Only the channels that can
   * actually vouch for a number belong here — `STAFF` and `EMAIL` must never
   * reach this route, because neither proves possession of the handset and this
   * route creates a Claimant.
   *
   * `WEB_FORM` was the omission that made the form's whole verification path
   * fail: the code was sent, the claimant typed it, it verified — and then this
   * DTO rejected the channel with a 400 the gateway logged and the claimant
   * never saw. The form simply stopped, with the code screen still on it.
   */
  @ApiProperty({
    example: 'TELEGRAM',
    enum: ['TELEGRAM', 'WHATSAPP', 'MESSENGER', 'WEB_CHAT', 'WEB_FORM'],
  })
  @IsIn(['TELEGRAM', 'WHATSAPP', 'MESSENGER', 'WEB_CHAT', 'WEB_FORM'])
  channel!: string;
}
