import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClaimCategory } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Malaysian states whose working-day calendars the SLA engine knows about.
 * Kept as a list rather than a free string: a typo silently selects the wrong
 * weekend, and four states observe Friday–Saturday rather than Saturday–Sunday.
 */
export const CALENDAR_STATES = [
  'Kuala Lumpur',
  'Selangor',
  'Johor',
  'Kedah',
  'Kelantan',
  'Terengganu',
  'Penang',
  'Perak',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Perlis',
  'Sabah',
  'Sarawak',
] as const;

@ValidatorConstraint({ name: 'fastTrackLimits', async: false })
class FastTrackLimitsRule implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value !== 'object' || Array.isArray(value)) return false;

    return Object.entries(value as Record<string, unknown>).every(([category, limit]) => {
      if (!Object.values(ClaimCategory).includes(category as ClaimCategory)) return false;
      // Decimal string, not a number: this ceiling decides whether a claim is
      // examined by desk review or by interview, and a float is the wrong
      // representation for a threshold that turns on equality at the boundary.
      return typeof limit === 'string' && /^\d+(\.\d{1,2})?$/.test(limit);
    });
  }

  defaultMessage(): string {
    return 'fastTrackLimits must map a valid claim category to a decimal amount string, e.g. { "TRAVEL": "5000.00" }';
  }
}

/**
 * Per-tenant configuration (MASTER_PLAN §4.2).
 *
 * `Tenant.settings` was free-form JSON, which is how it came to hold nothing
 * at all while the behaviour it was meant to drive stayed hardcoded or absent.
 * Every field here gates something real, so each is validated rather than
 * trusted, and each is optional so a patch touches only what it names.
 */
export class UpdateTenantSettingsDto {
  /**
   * Is this firm a BNM-registered adjuster?
   *
   * Flipping this on turns advisory controls into hard gates: qualified-author
   * restriction, senior countersign, conflict screening. It is not a
   * preference, which is why the service requires a reason with it.
   */
  @ApiPropertyOptional({ description: 'BNM-registered adjuster — turns advisory gates into hard ones' })
  @IsOptional()
  @IsBoolean()
  licensedMode?: boolean;

  @ApiPropertyOptional({ enum: CALENDAR_STATES })
  @IsOptional()
  @IsEnum(CALENDAR_STATES as unknown as object, {
    message: `calendarState must be one of: ${CALENDAR_STATES.join(', ')}`,
  })
  calendarState?: string;

  @ApiPropertyOptional({ enum: ClaimCategory, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ClaimCategory, { each: true })
  fastTrackCategories?: ClaimCategory[];

  @ApiPropertyOptional({ example: { TRAVEL: '5000.00', FIRE: '50000.00' } })
  @IsOptional()
  @IsObject()
  @Validate(FastTrackLimitsRule)
  fastTrackLimits?: Record<string, string>;

  /** Display name on white-labelled claimant-facing output. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  brandingName?: string;

  /** Reason for the change. Required when licensedMode is being altered. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
