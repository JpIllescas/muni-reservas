import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsBoolean,
  Max,
  Min,
} from 'class-validator';

export class UpdateResourceDto {
  @IsOptional()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsOptional()
  @IsString()
  location: string;

  @IsOptional()
  @IsNumber()
  capacity: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pricePerUnit: number;

  @IsOptional()
  @IsString()
  rules: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  advanceDays: number;

  // Tope de duración por reserva en minutos (solo canchas). Ej. 180 = 3 h.
  @IsOptional()
  @IsInt()
  @Min(30)
  maxDurationMinutes?: number;

  // Ventana de pago en horas (solo canchas). Ej. 2 = 2 h.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  paymentWindowHours?: number;

  // horas para la 1ª confirmación antes de que expire pending_confirmation.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(168)
  confirmationWindowHours?: number;

  // minutos para validar la boleta antes de recordar a la administración.
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(1440)
  validationWindowMinutes?: number;

  // ¿exige boleta para aprobar? false = confirmación por llamada.
  @IsOptional()
  @IsBoolean()
  requiresVoucher?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive: boolean;
}
