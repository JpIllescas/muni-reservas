import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName: string;

  // DPI NO editable (USR-1): identidad inmutable. Se omite del DTO a propósito;
  // con forbidNonWhitelisted, enviarlo devuelve 400 en el boundary, y el servicio
  // tampoco lo asigna (defensa en profundidad).
  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/, {
    message: 'El teléfono debe tener exactamente 8 dígitos.',
  })
  phone: string;
}
