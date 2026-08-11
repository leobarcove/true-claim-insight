import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

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

export class AssignConversationDto {
  /**
   * Who takes it, or null to put it back in the unassigned queue.
   *
   * Nullable rather than a separate "unassign" route: releasing a conversation
   * you cannot finish is the same act as passing it on, and splitting them
   * gave agents two buttons for one decision.
   */
  @ApiProperty({ example: 'a3f1c9d2-3b44-4c5d-8e6f-7a8b9c0d1e2f', nullable: true })
  @IsOptional()
  @IsUUID()
  assigneeId?: string | null;
}

export class SetConversationStatusDto {
  @ApiProperty({ enum: ['OPEN', 'PENDING', 'SNOOZED'], example: 'PENDING' })
  @IsIn(['OPEN', 'PENDING', 'SNOOZED'])
  status!: 'OPEN' | 'PENDING' | 'SNOOZED';

  /**
   * When a snoozed conversation comes back. Required for SNOOZED, rejected
   * otherwise — a wake time on an open conversation means nothing and would
   * read as a deadline.
   */
  @ApiPropertyOptional({ example: '2026-08-12T09:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  snoozedUntil?: string;
}

export class AddNoteDto {
  /**
   * A note for colleagues. Never sent to the claimant.
   *
   * Longer cap than a reply: a note is where the reasoning goes, and the
   * reason notes get written elsewhere is usually that the box was too small.
   */
  @ApiProperty({ example: 'Policy number does not match — asked ops to check the schedule.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  text!: string;
}
