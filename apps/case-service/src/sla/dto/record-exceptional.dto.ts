import { ApiProperty } from '@nestjs/swagger';
import { SlaExceptionalGround, SlaStage } from '@prisma/client';
import { IsEnum, IsInt, IsString, Max, Min, MinLength } from 'class-validator';

/**
 * Claiming CSP 10.13's exceptional-circumstance relief on one clock.
 *
 * Every field is required, the reason included: the point of the record is
 * that the firm can explain, later and to someone unsympathetic, why a window
 * it is measured against did not apply.
 */
export class RecordExceptionalDto {
  @ApiProperty({ enum: SlaStage })
  @IsEnum(SlaStage)
  stage!: SlaStage;

  @ApiProperty({ enum: SlaExceptionalGround })
  @IsEnum(SlaExceptionalGround)
  ground!: SlaExceptionalGround;

  @ApiProperty({ example: 'Klang Valley flood event; site inaccessible until water receded.' })
  @IsString()
  @MinLength(8)
  reason!: string;

  @ApiProperty({ example: 10, minimum: 1, maximum: 60 })
  @IsInt()
  @Min(1)
  @Max(60)
  workingDays!: number;
}
