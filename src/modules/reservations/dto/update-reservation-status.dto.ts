import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ReservationStatus } from '../../../common/enums/reservation-status.enum';

export class UpdateReservationStatusDto {
  @IsNotEmpty()
  @IsEnum(ReservationStatus)
  status: ReservationStatus;

  @IsOptional()
  @IsString()
  reason: string;

  // CR-7: número de la boleta física. El servicio lo exige al aprobar un
  // recurso sin comprobante (requiresVoucher=false: pagan en efectivo al llegar).
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptNumber?: string;
}
