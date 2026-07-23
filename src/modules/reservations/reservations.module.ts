import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { Reservation } from './entities/reservation.entity';
import { ReservationLog } from './entities/reservation-log.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { RejectionReasonsModule } from '../rejection-reasons/rejection-reasons.module';

@Module({
  // Solo registramos los repos que el servicio inyecta directamente; el resto
  // de entidades (Resource, ResourceSchedule, etc.) se accede vía el manager
  // de la transacción, que usa la conexión global.
  imports: [
    TypeOrmModule.forFeature([Reservation, ReservationLog]),
    NotificationsModule,
    RejectionReasonsModule,
  ],
  controllers: [ReservationsController],
  providers: [ReservationsService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
