import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';
import { Reservation } from './entities/reservation.entity';
import { ReservationLog } from './entities/reservation-log.entity';
import { Resource } from '../resources/entities/resource.entity';
import {ResourceSchedule } from '../resources/entities/resource-schedule.entity';
import { NotificationsModule } from '../notifications/notifications.module'

@Module({
    // importacion de las entidades que el servicio de reservas utiliza
    imports: [
      TypeOrmModule.forFeature([
        Reservation,
        ReservationLog,
        Resource,
        ResourceSchedule,
      ]),
      NotificationsModule,
    ],
    controllers: [ReservationsController],
    providers: [ReservationsService],
    exports: [ReservationsService],
})
export class ReservationsModule {}