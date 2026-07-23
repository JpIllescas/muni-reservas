import { IsOptional, IsString } from 'class-validator';
import { IsDPI } from '../../../common/validators/is-dpi.validator';

// subida de las fotos del DPI 
export class UploadDpiDto {
  @IsOptional()
  @IsString()
  @IsDPI()
  dpi?: string;
}
