import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpertOutcome } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** What the expert answered — recorded once against the outstanding referral. */
export class RecordExpertOutcomeDto {
  @ApiProperty({ enum: ExpertOutcome })
  @IsEnum(ExpertOutcome)
  outcome!: ExpertOutcome;

  @ApiProperty({ example: 'Condition is unrelated to any pre-existing illness; claim may proceed.' })
  @IsString()
  @MinLength(8)
  @MaxLength(10000)
  opinion!: string;
}

/** Who was instructed, alongside the question already carried by the note. */
export class ReferToExpertDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  note!: string;

  @ApiPropertyOptional({ example: 'Dr Lim Wei Sheng, Pantai Medical' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  expertName?: string;
}
