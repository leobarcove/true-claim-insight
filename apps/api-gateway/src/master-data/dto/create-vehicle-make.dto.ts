import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateVehicleMakeDto {
  @ApiProperty({ example: 'Toyota', description: 'The name of the vehicle make' })
  @IsString()
  @IsNotEmpty()
  name!: string;
}
