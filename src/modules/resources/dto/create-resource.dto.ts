import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { ResourceType } from '../../../common/enums/resource-type.enum';

export class CreateResourceDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsEnum(ResourceType)
  type: ResourceType;

  @IsOptional()
  @IsString()
  location: string;

  @IsOptional()
  @IsNumber()
  capacity: number;

  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  pricePerUnit: number;

  @IsOptional()
  @IsString()
  rules: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  advanceDays: number;
}
