import { Module, BadRequestException } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { Payment } from './entities/payment.entity';
import { Reservation } from '../reservations/entities/reservation.entity';

@Module({
  imports: [
    // ReservationLog se escribe vía el manager de la transacción (conexión global).
    TypeOrmModule.forFeature([Payment, Reservation]),

    // Configuracion de Multer para guardar las boletas en la carpeta definida en .env
    MulterModule.registerAsync({
      useFactory: () => {
        const maxSizeBytes =
          parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10) * 1024 * 1024;

        return {
          storage: diskStorage({
            destination: process.env.UPLOAD_PATH || './uploads',
            filename: (req, file, cb) => {
              const uniqueSuffix =
                Date.now() + '-' + Math.round(Math.random() * 1e9);
              cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
            },
          }),
          fileFilter: (req, file, cb) => {
            if (!file.mimetype.match(/\/(jpg|jpeg|png|pdf)$/)) {
              return cb(
                new BadRequestException('Solo se permiten imágenes (JPG/PNG) o PDFs'),
                false,
              );
            }
            cb(null, true);
          },
          limits: {
            fileSize: maxSizeBytes,
            files: 1,
          },
        };
      },
    }),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule { }
