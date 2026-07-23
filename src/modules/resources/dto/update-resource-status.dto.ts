import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateResourceStatusDto {
  // `key` del estado en el catálogo resource_statuses. La existencia y que esté
  // activo se validan en el service (findActiveByKey), no con @IsEnum: el catálogo
  // es dinámico (el admin agrega estados nuevos).
  @IsNotEmpty()
  @IsString()
  @MaxLength(40)
  status: string;

  // Motivo opcional (ej. "Cancha cerrada por torneo X"). Se muestra al ciudadano
  // en la disponibilidad y queda en el audit log. Se ignora si el estado no
  // bloquea reservas (ej. 'available').
  @IsOptional()
  @IsString()
  @MaxLength(300)
  statusReason?: string;
}
