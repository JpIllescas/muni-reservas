import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { IsDPI } from '../../../common/validators/is-dpi.validator';

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @IsDPI()
  dpi: string;

  @IsOptional()
  @IsString()
  phone: string;
}
