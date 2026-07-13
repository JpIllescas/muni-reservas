import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// CR-5: el admin/operador registra un pago EN EFECTIVO hecho en la cancha,
// subiendo la boleta física en nombre del ciudadano. A diferencia del DTO del
// ciudadano, el número de boleta es OBLIGATORIO: es el único respaldo del pago.
export class AdminUploadVoucherDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  transactionReference: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
