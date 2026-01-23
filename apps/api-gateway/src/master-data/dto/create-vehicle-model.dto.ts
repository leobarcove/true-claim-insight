import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateVehicleModelDto {
  @ApiProperty({ example: 'Camry', description: 'The name of the vehicle model' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'uuid', description: 'The ID of the vehicle make' })
  @IsString()
  @IsNotEmpty()
  makeId!: string;
}
