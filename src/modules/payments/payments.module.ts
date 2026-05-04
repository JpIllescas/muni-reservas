import { Module, BadRequestException } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment } from './entities/payment.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ReservationLog } from '../reservations/entities/reservation-log.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Reservation, ReservationLog]),

    // Configuracion de Multer para guardar las boletas en la carpeta definida en .env
    MulterModule.registerAsync({
      useFactory: () => ({
        storage: diskStorage({
          destination: process.env.UPLOAD_PATH || './uploads',
          filename: (req, file, cb) => {
            // Generar un nombre único: timestamp-ranodm.extension
            const uniqueSuffix =
              Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
          },
        }),
        fileFilter: (req, file, cb) => {
          if (!file.mimetype.match(/\/(jpg|jpeg|png|pdf)$/)) {
            return cb(new BadRequestException('Solo se permiten imágenes (JPG/PNG) o PDFs'), false);
          }
          cb(null, true);
        },
      }),
    }),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
