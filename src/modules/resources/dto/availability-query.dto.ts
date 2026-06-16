import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date debe tener el formato YYYY-MM-DD',
  })
  date: string;
}
