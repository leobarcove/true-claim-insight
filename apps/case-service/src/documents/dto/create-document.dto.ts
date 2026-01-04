import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsEnum, IsOptional, IsInt, Min } from 'class-validator';

export enum DocumentType {
  DAMAGE_PHOTO = 'DAMAGE_PHOTO',
  POLICE_REPORT = 'POLICE_REPORT',
  ASSESSMENT_REPORT = 'ASSESSMENT_REPORT',
  SIGNED_STATEMENT = 'SIGNED_STATEMENT',
  IDENTITY_DOCUMENT = 'IDENTITY_DOCUMENT',
  VEHICLE_REGISTRATION = 'VEHICLE_REGISTRATION',
  OTHER = 'OTHER',
}

export class CreateDocumentDto {
  @ApiProperty({ enum: DocumentType, example: DocumentType.DAMAGE_PHOTO })
  @IsEnum(DocumentType)
  type!: DocumentType;

  @ApiProperty({ example: 'damage-photo-001.jpg' })
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty({ example: 's3://tci-documents/claims/123/damage-photo-001.jpg' })
  @IsString()
  @IsNotEmpty()
  storageUrl!: string;

  @ApiPropertyOptional({ example: 'image/jpeg' })
  @IsString()
  @IsOptional()
  mimeType?: string;

  @ApiPropertyOptional({ example: 1024000 })
  @IsInt()
  @Min(0)
  @IsOptional()
  fileSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: any;
}
