import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { ReservationStatus } from '../../../common/enums/reservation-status.enum';

export class UpdateReservationStatusDto {
  @IsNotEmpty()
  @IsEnum(ReservationStatus)
  status: ReservationStatus;

  // Al rechazar: motivo en texto libre. Opcional si se manda rejectionReasonId
  // (queda como nota adicional). El servicio exige al menos uno de los dos.
  @IsOptional()
  @IsString()
  reason: string;

  // Al rechazar: motivo elegido del catálogo (estandariza el texto al ciudadano
  // y habilita reportes). Ej. "No autorizado".
  @IsOptional()
  @IsUUID()
  rejectionReasonId?: string;

  // CR-7: número de la boleta física. El servicio lo exige al aprobar un
  // recurso sin comprobante (requiresVoucher=false: pagan en efectivo al llegar).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptNumber?: string;
}
