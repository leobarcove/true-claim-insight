import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SettlementBasis } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Money arrives as a string, not a number.
 *
 * A JSON number is an IEEE-754 double, and `18014398509481985.0` is not the
 * figure anyone typed. Quantum is the one place in this system where a rounding
 * artefact becomes a sum of money in a report, so the value is carried as a
 * decimal string end to end and parsed into `Prisma.Decimal` on arrival.
 */
export class CreateWorksheetDto {
  @ApiProperty({ enum: SettlementBasis })
  @IsEnum(SettlementBasis)
  basis!: SettlementBasis;

  @ApiProperty({ example: '50000.00', description: 'Assessed cost to reinstate or repair' })
  @IsNumberString()
  assessedLoss!: string;

  @ApiProperty({ example: '150000.00', description: 'Sum insured on the policy or section' })
  @IsNumberString()
  sumInsured!: string;

  @ApiPropertyOptional({ example: '0.2500', description: 'Rate 0–1; indemnity basis only' })
  @IsOptional()
  @IsNumberString()
  depreciationRate?: string;

  @ApiPropertyOptional({ example: '2000.00' })
  @IsOptional()
  @IsNumberString()
  betterment?: string;

  @ApiPropertyOptional({ example: '250000.00', description: 'True value at risk at the time of loss' })
  @IsOptional()
  @IsNumberString()
  valueAtRisk?: string;

  @ApiProperty({ description: 'Whether the policy carries a condition of average' })
  @IsBoolean()
  averageCondition!: boolean;

  @ApiPropertyOptional({ example: '1500.00' })
  @IsOptional()
  @IsNumberString()
  salvage?: string;

  @ApiPropertyOptional({ example: '1000.00' })
  @IsOptional()
  @IsNumberString()
  excess?: string;

  @ApiPropertyOptional({ description: 'Adjuster narrative on the basis of assessment' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
