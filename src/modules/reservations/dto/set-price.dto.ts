import {
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

// el admin fija el PRECIO FINAL de una reserva puntual.
export class SetPriceDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  newTotal: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(500)
  reason: string;
}
