import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';

// Filtros del listado de bitácora (todos opcionales y combinables).
export class FindAuditDto extends PaginationDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  entityType?: string;

  // Subcadena de la acción (ej. "STATUS", "VIEW_DPI").
  @IsOptional()
  @IsString()
  @MaxLength(50)
  action?: string;

  // Subcadena del nombre o correo de quien ejecutó la acción.
  @IsOptional()
  @IsString()
  @MaxLength(100)
  user?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from debe tener el formato YYYY-MM-DD',
  })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to debe tener el formato YYYY-MM-DD',
  })
  to?: string;
}
