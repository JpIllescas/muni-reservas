import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateReservationDto } from './create-reservation.dto';

// reserva creada por el admin/operador a nombre de un ciudadano existente.
export class AdminCreateReservationDto extends CreateReservationDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;
}
