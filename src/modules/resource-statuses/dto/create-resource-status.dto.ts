import {
  IsBoolean,
  IsHexColor,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateResourceStatusDto {
  // Slug estable e inmutable. Solo minúsculas, números y guiones (se valida aquí
  // para que la entrada del admin no genere una key basura). Es el destino del FK.
  @IsNotEmpty()
  @IsString()
  @MaxLength(40)
  @Matches(/^[a-z][a-z0-9-]*$/, {
    message:
      'La clave debe ser minúsculas/números/guiones y empezar con letra (ej. "reservado-liga").',
  })
  key: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(80)
  label: string;

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
