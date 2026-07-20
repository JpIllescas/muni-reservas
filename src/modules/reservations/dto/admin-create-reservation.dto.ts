import { IsNotEmpty, IsUUID } from 'class-validator';
import { CreateReservationDto } from './create-reservation.dto';

// B4: reserva creada por el admin/operador a nombre de un ciudadano existente.
// Igual que CreateReservationDto pero con el usuario objetivo.
export class AdminCreateReservationDto extends CreateReservationDto {
  @IsNotEmpty()
  @IsUUID()
  userId: string;
}
