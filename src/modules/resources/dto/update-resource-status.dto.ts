import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateResourceStatusDto {
  // `key` del estado en el catálogo resource_statuses.
  @IsNotEmpty()
  @IsString()
  @MaxLength(40)
  status: string;

  // Motivo opcional (ej. "Cancha cerrada por torneo X").
  @IsOptional()
  @IsString()
  @MaxLength(300)
  statusReason?: string;
}
