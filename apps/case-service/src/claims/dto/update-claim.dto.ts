import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsObject,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { IncidentLocationDto } from './create-claim.dto';

export class UpdateClaimDto {
  @ApiPropertyOptional({ example: 'Updated description of the incident' })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ type: IncidentLocationDto })
  @IsObject()
  @IsOptional()
  @ValidateNested()
  @Type(() => IncidentLocationDto)
  incidentLocation?: IncidentLocationDto;
}
