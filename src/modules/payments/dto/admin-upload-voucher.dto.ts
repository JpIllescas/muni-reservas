import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AdminUploadVoucherDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  transactionReference: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
