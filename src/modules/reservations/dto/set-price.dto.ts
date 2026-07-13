import {
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

// CR-3: el admin fija el PRECIO FINAL de una reserva puntual (carta/acuerdo).
// A diferencia de FLO-2 (que rebaja un monto), aquí se manda el precio que la
// reserva debe quedar valiendo; la justificación es siempre obligatoria.
export class SetPriceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  newTotal: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
