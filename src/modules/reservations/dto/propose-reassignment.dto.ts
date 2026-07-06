import { IsNotEmpty, IsString, Matches, ValidateIf } from 'class-validator';

// RES-3: el admin/operador propone un nuevo slot para una reserva (misma
// cancha/rancho). Mismos formatos que CreateReservationDto. startTime/endTime
// son opcionales aquí: se exigen recién en el servicio y solo para canchas
// (los ranchos son de día completo → van null).
export class ProposeReassignmentDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'proposedDate debe tener el formato YYYY-MM-DD',
  })
  proposedDate: string;

  @ValidateIf((o: ProposeReassignmentDto) => o.proposedStartTime !== undefined)
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'proposedStartTime debe tener formato HH:MM',
  })
  proposedStartTime?: string;

  @ValidateIf((o: ProposeReassignmentDto) => o.proposedEndTime !== undefined)
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'proposedEndTime debe tener formato HH:MM',
  })
  proposedEndTime?: string;
}
