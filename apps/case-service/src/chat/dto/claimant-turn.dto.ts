import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/**
 * One thing the claimant did in the PWA: typed something, tapped an option, or
 * attached a document they have already uploaded.
 *
 * Everything is bounded. This is the one route on the platform where an
 * unauthenticated-adjacent party — a logged-in claimant, but still the public —
 * writes rows the firm later reads as evidence, so nothing arrives unmeasured.
 */
export class ClaimantTurnDto {
  /**
   * The browser's own id for this turn, which makes retries safe.
   *
   * A claimant on a phone loses signal mid-send more often than anyone likes,
   * and the retry must not answer the same question twice. The gateway dedupes
   * on it, so it is required rather than generated here: an id we invent per
   * request is a new turn every time and defeats the purpose.
   *
   * Charset is restricted because the value is namespaced with a colon before
   * it becomes the dedupe key. A colon inside it could be crafted to collide
   * with another binding's key, which would drop that claimant's answer as
   * "already seen" — a silent one.
   */
  @ApiProperty({ example: '0f1c9a2e-3b44-4c5d-8e6f-7a8b9c0d1e2f' })
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{1,64}$/, {
    message: 'clientMessageId must be 1-64 characters of letters, digits, underscore or hyphen',
  })
  clientMessageId!: string;

  /**
   * Free text the claimant typed.
   *
   * Capped at the same 4096 as Telegram's message limit. The channel itself has
   * no bound — `maxMessageChars` is Infinity for web chat — but an answer
   * longer than that is not an answer, and the column is read back into
   * messages that do have limits when a conversation moves to a human.
   */
  @ApiPropertyOptional({ example: 'The suitcase wheel snapped off in transit' })
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  text?: string;

  /** The value behind a tapped option, where the claimant chose rather than typed. */
  @ApiPropertyOptional({ example: 'FLIGHT_DELAY' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  callbackValue?: string;

  /**
   * The step whose options were on screen when they tapped.
   *
   * The gateway compares it with the step now current and ignores a mismatch.
   * Without it, a double-tap on a slow connection applies the first answer to
   * whichever question has moved into its place — which on the claim-type menu
   * stored the claim type as the policy number.
   */
  @ApiPropertyOptional({ example: 'policy-number' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  callbackStepId?: string;

  /**
   * A CaseDocument already uploaded through the documents endpoint.
   *
   * The gateway checks it belongs to this claim before accepting it, so a
   * guessed or borrowed id cannot be attached as evidence.
   */
  @ApiPropertyOptional({ example: '9bfaa9e4-3674-4b2f-beed-0f161dde01af' })
  @IsOptional()
  @IsUUID()
  storedDocumentId?: string;

  /**
   * The claimant's language, from the browser.
   *
   * Same role as Telegram's `language_code`: it selects the consent notice and
   * the flow's wording. Not asked for, because asking costs a turn and gets
   * skipped, and the client already knows.
   */
  @ApiPropertyOptional({ example: 'ms' })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale?: string;
}
