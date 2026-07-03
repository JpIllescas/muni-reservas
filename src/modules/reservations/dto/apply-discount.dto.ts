import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

// FLO-2: descuento por carta/oferta (monto FIJO en quetzales).
export class ApplyDiscountDto {
  // Cuánto se rebaja del monto original. 0 = quitar el descuento vigente.
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount: number;

  // Justificación (carta u oferta que respalda la rebaja). Obligatoria al
  // aplicar (amount > 0); se valida en el service porque depende del amount.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason?: string;
}
