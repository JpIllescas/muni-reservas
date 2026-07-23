import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

// crea un horario especial para una fecha concreta. openTime < closeTime se valida en el service (comparación entre campos). slotDurationMin opcional (canchas).
export class CreateScheduleOverrideDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'overrideDate debe tener el formato YYYY-MM-DD',
  })
  overrideDate: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'openTime debe tener formato HH:MM',
  })
  openTime: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'closeTime debe tener formato HH:MM',
  })
  closeTime: string;

  @IsOptional()
  @IsNumber()
  slotDurationMin?: number;
}
