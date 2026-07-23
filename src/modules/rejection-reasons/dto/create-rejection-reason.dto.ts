import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRejectionReasonDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(120)
  labelAdmin: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  messageCitizen: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
