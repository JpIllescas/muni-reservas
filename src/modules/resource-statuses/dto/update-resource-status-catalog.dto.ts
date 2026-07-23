import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

// Actualización del catálogo. `key` NO figura: es inmutable (el FK apunta a ella
// sin ON UPDATE CASCADE). Solo se editan la etiqueta, los flags y el orden.
export class UpdateResourceStatusCatalogDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsOptional()
  @IsBoolean()
  blocksReservations?: boolean;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
