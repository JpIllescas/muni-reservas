import { IsOptional, IsString } from 'class-validator';

export class UpdateSedeDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  address?: string;
}
