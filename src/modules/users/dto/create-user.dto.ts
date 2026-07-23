import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Role } from '../../../common/enums/role.enum';

export class CreateUserDto {
  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  // Misma política de fortaleza que el registro público (auth/register.dto).
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message:
      'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.',
  })
  password: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{8}$/, {
    message: 'El teléfono debe tener exactamente 8 dígitos.',
  })
  phone: string;

  // Solo se acepta operator|admin (se valida en el servicio). El citizen se autogestiona por el registro público, no por esta pantalla.
  @IsEnum(Role)
  role: Role;
}
