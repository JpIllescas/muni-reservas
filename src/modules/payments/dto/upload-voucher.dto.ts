import { IsOptional, IsString } from 'class-validator';

export class UploadVoucherDto {
  @IsOptional()
  @IsString()
  transactionReference?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}