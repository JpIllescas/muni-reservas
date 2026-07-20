import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class AvailabilityRangeQueryDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'from debe tener el formato YYYY-MM-DD',
  })
  from: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'to debe tener el formato YYYY-MM-DD',
  })
  to: string;
}
