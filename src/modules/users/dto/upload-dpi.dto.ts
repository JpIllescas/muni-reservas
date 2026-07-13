import { IsOptional, IsString } from 'class-validator';
import { IsDPI } from '../../../common/validators/is-dpi.validator';

// CR-1: subida de las fotos del DPI (frente y reverso van como archivos en el
// form-data: dpiFront / dpiBack). El número es opcional AQUÍ porque puede
// venir de antes (perfil/registro); el servicio exige que, al terminar, el
// usuario tenga número + ambas fotos. Si ya está fijado, no se manda (USR-1:
// inmutable).
export class UploadDpiDto {
  @IsOptional()
  @IsString()
  @IsDPI()
  dpi?: string;
}
