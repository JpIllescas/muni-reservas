import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { ResourceType } from '../../../common/enums/resource-type.enum';

export class CreateResourceDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  // Sede a la que pertenece el recurso (ADM-1, NOT NULL). El admin solo puede
  // crear en sus propias sedes; el super-admin, en cualquiera (se valida en el servicio).
  @IsNotEmpty()
  @IsUUID()
  sedeId: string;

  @IsOptional()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsEnum(ResourceType)
  type: ResourceType;

  @IsOptional()
  @IsString()
  location: string;

  @IsOptional()
  @IsNumber()
  capacity: number;

  @IsNotEmpty()
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

  // Ventana de pago en horas (solo canchas). Default 24 si se omite. Ej. 2 = 2 h.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(72)
  paymentWindowHours?: number;

  // FLO-1: ¿exige boleta para aprobar? Default true. false = confirmación por llamada.
  @IsOptional()
  @IsBoolean()
  requiresVoucher?: boolean;
}
