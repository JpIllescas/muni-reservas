import { IsEnum, IsOptional } from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { ReservationStatus } from '../../../common/enums/reservation-status.enum';

export class FindReservationsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;
}
