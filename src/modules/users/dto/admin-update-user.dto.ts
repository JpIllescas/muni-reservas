import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

// Edición de una cuenta administrativa (admin/operador) por el super-admin
export class AdminUpdateUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  fullName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/, {
    message: 'El teléfono debe tener exactamente 8 dígitos.',
  })
  phone?: string;

  // Misma política de fortaleza que el alta (create-user.dto / auth register).
  @IsOptional()
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, {
    message:
      'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número.',
  })
  password?: string;
}
