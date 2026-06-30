import {
  IsNotEmpty,
  IsString,
  IsUUID,
  Matches,
  ValidateIf,
} from 'class-validator';

export class CreateReservationDto {
  @IsNotEmpty()
  @IsUUID()
  resourceId: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'reservationDate debe tener el formato YYYY-MM-DD',
  })
  reservationDate: string;

  // Solo requeridos si el recurso es de tipo COURT (cancha)
  @ValidateIf((o) => o.startTime !== undefined)
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'startTime debe tener formato HH:MM',
  })
  startTime?: string;

  @ValidateIf((o) => o.endTime !== undefined)
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'endTime debe tener formato HH:MM',
  })
  endTime?: string;

  // RES-2: contacto del encargado de la reserva. Obligatorio para toda reserva.
  @IsNotEmpty()
  @IsString()
  contactName: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{8}$/, {
    message: 'contactPhone debe tener exactamente 8 dígitos.',
  })
  contactPhone: string;
}
