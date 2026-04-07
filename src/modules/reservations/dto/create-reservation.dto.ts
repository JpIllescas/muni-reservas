import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateReservationDto {
  @IsNotEmpty()
  @IsUUID()
  resourceId: string;

  @IsNotEmpty()
  @IsDateString()
  reservationDate: string;

  // Requerido para canchas, null para ranchos
  @IsOptional()
  @IsString()
  startTime: string;

  @IsOptional()
  @IsString()
  endTime: string;
}