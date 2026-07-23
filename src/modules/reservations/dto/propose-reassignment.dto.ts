import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

// el admin/operador propone un nuevo slot para una reserva
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

  // motivo del cambio; obligatorio, se muestra al ciudadano y va en el email.
  @IsNotEmpty()
  @IsString()
  @MaxLength(300)
  reason: string;
}
