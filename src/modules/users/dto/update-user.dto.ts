import { IsOptional, IsString, IsEnum } from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName: string;

  @IsOptional()
  @IsString()
  dpi: string;

  @IsOptional()
  @IsString()
  phone: string;
}
