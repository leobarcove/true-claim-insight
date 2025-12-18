import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ description: 'ID of the claim this session is for' })
  @IsString()
  claimId!: string;

  @ApiPropertyOptional({ description: 'Scheduled start time (ISO 8601)' })
  @IsOptional()
  @IsDateString()
  scheduledTime?: string;
}

export class JoinRoomDto {
  @ApiProperty({ description: 'User ID joining the room' })
  @IsString()
  userId!: string;

  @ApiProperty({ 
    description: 'Role of the user joining',
    enum: ['CLAIMANT', 'ADJUSTER'],
  })
  @IsEnum(['CLAIMANT', 'ADJUSTER'])
  role!: 'CLAIMANT' | 'ADJUSTER';
}

export class EndRoomDto {
  @ApiPropertyOptional({ description: 'Reason for ending the session' })
  @IsOptional()
  @IsString()
  reason?: string;
}

