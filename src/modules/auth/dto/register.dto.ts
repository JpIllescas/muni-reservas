import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { IsDPI } from '../../../common/validators/is-dpi.validator';

export class RegisterDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message:
      'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.',
  })
  password: string;

  @IsOptional()
  @IsString()
  @IsDPI()
  dpi: string;

  @IsOptional()
  @IsString()
  phone: string;
}
