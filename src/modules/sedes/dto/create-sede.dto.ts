import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateSedeDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  address?: string;
}
