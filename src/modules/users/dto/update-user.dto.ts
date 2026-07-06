import { IsOptional, IsString, Matches } from 'class-validator';
import { IsDPI } from '../../../common/validators/is-dpi.validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  fullName: string;

  // DPI de UNA sola escritura (USR-1 + follow-up): el registro lo deja opcional,
  // así que se permite ESTABLECERLO aquí si aún está vacío (FEL/CGC lo van a
  // necesitar para recibos). Una vez fijado es inmutable: el servicio rechaza
  // cualquier cambio, aunque venga el mismo valor.
  @IsOptional()
  @IsString()
  @IsDPI()
  dpi?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{8}$/, {
    message: 'El teléfono debe tener exactamente 8 dígitos.',
  })
  phone: string;
}
