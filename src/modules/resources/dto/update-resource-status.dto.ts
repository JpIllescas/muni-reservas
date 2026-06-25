import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ResourceStatus } from '../../../common/enums/resource-status.enum';

export class UpdateResourceStatusDto {
  @IsEnum(ResourceStatus)
  status: ResourceStatus;

  // Motivo opcional (ej. "Cancha cerrada por torneo X"). Se muestra al ciudadano
  // en la disponibilidad y queda en el audit log. Se ignora si status=available.
  @IsOptional()
  @IsString()
  @MaxLength(300)
  statusReason?: string;
}
