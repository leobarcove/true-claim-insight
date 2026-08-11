import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class TakeOverDto {
  /**
   * Required, not optional. A count of handovers tells you the bot struggles;
   * a column of reasons tells you what to fix — and that difference is the
   * whole point of reviewing conversations.
   */
  @ApiProperty({
    example: 'Bot could not parse the incident date the claimant kept sending',
    description: 'Why a human is stepping in. Feeds bot-performance review.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(500)
  reason!: string;
}

export class ReplyDto {
  /**
   * Capped below the tightest channel body limit in `CHANNEL_CAPABILITIES`
   * (WhatsApp's interactive body, 1024) so an agent is told the message is too
   * long while typing, rather than after the platform rejects it.
   */
  @ApiProperty({ example: 'Hello, this is Aisyah from Pacific Adjusters.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  text!: string;
}

export class UnbindConversationDto {
  /**
   * Why the link is being broken. Required for the same reason take-over's is,
   * only more so: this revokes a claimant's access to their own claim
   * conversation, and "who did this and why" is the first question anyone
   * will ask afterwards.
   */
  @ApiProperty({
    example: 'Claimant reports their Telegram account was compromised',
    description: 'Why the binding is being revoked. Recorded on the audit row.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
