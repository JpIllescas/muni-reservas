import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ReservationStatus } from '../../../common/enums/reservation-status.enum';

export class UpdateReservationStatusDto {
  @IsNotEmpty()
  @IsEnum(ReservationStatus)
  status: ReservationStatus;

  @IsOptional()
  @IsString()
  reason: string;
}