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

  // Al rechazar: motivo en texto libre.
  @IsOptional()
  @IsString()
  reason: string;

  // Al rechazar: motivo elegido del catálogo
  @IsOptional()
  @IsUUID()
  rejectionReasonId?: string;

  // número de la boleta física. 
  @IsOptional()
  @IsString()
  @MaxLength(100)
  receiptNumber?: string;
}
