import { Controller, Post, Get, Param, UseGuards, UseInterceptors, UploadedFile, Body, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentsService } from './payments.service';
import { UploadVoucherDto } from './dto/upload-voucher.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // POST /api/payments/:reservationId/voucher - El ciudadano sube su boleta
  @Post(':reservationId/voucher')
  @UseInterceptors(FileInterceptor('voucher')) // 'voucher' es el nombre del campo en el form-data
  uploadVoucher(
    @Param('reservationId') reservationId: string,
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadVoucherDto,
  ) {
    // Validación básica del tamaño del archivo (ej. 5MB)
    const maxSize = parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10) * 1024 * 1024;
    if (file && file.size > maxSize) {
      throw new BadRequestException(`El archivo excede el límite de ${process.env.MAX_FILE_SIZE_MB}MB.`);
    }

    return this.paymentsService.uploadVoucher(reservationId, user.id, file, dto);
  }
  
  // GET /api/payments/reservation/:reservationId - Ver el pago asociado a una reserva
  @Get('reservation/:reservationId')
  getPaymentDetails(@Param('reservationId') reservationId: string) {
    return this.paymentsService.getPaymentByReservation(reservationId);
  }
}