import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateExceptionDto {
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'exceptionDate debe tener el formato YYYY-MM-DD',
  })
  exceptionDate: string;

  @IsNotEmpty()
  @IsString()
  reason: string;
}
