import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Body,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';
import { PaymentsService } from './payments.service';
import { UploadVoucherDto } from './dto/upload-voucher.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // POST /api/payments/:reservationId/voucher - El ciudadano sube su boleta
  @Post(':reservationId/voucher')
  @UseInterceptors(FileInterceptor('voucher')) // 'voucher' es el nombre del campo en el form-data
  uploadVoucher(
    @Param('reservationId') reservationId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadVoucherDto,
  ) {
    return this.paymentsService.uploadVoucher(
      reservationId,
      user.id,
      file,
      dto,
    );
  }

  // GET /api/payments/reservation/:reservationId - Ver el pago asociado a una reserva
  @Get('reservation/:reservationId')
  getPaymentDetails(
    @Param('reservationId') reservationId: string,
    @CurrentUser() user: AuthUser, //saber quien hace la peticion
  ) {
    return this.paymentsService.getPaymentByReservation(reservationId, user);
  }

  // GET /api/payments/reservation/:reservationId/voucher - Ver/descargar la boleta
  @Get('reservation/:reservationId/voucher')
  async getVoucherFile(
    @Param('reservationId') reservationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<StreamableFile> {
    const { path, contentType, fileName } =
      await this.paymentsService.getVoucherFile(reservationId, user);

    return new StreamableFile(createReadStream(path), {
      type: contentType,
      disposition: `inline; filename="${fileName}"`,
    });
  }
}
