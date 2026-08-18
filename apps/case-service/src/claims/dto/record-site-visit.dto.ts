import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** What a site visit found — one attendance, recorded after the fact. */
export class RecordSiteVisitDto {
  @ApiProperty({ description: 'When the adjuster actually attended (ISO 8601)' })
  @IsISO8601()
  attendedAt!: string;

  @ApiProperty({ description: 'What was found on the ground' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  findings!: string;

  @ApiPropertyOptional({ description: 'Where the inspection actually took place, as attended' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  locationNote?: string;

  @ApiPropertyOptional({ description: 'What bounded the inspection — access, weather, light' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  limitations?: string;
}
