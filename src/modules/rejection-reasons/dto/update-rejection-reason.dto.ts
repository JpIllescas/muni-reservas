import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateRejectionReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  labelAdmin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  messageCitizen?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
