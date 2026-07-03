import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateScheduleDto {
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @IsNotEmpty()
  @IsString()
  openTime: string;

  @IsNotEmpty()
  @IsString()
  closeTime: string;

  //Obligatorio para canchas, null para ranchos
  @IsOptional()
  @IsNumber()
  slotDurationMin: number;
}
