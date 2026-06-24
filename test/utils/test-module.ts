import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { testDataSourceOptions } from '../test-data-source';

import { ReservationsService } from '../../src/modules/reservations/reservations.service';
import { PaymentsService } from '../../src/modules/payments/payments.service';
import { ResourcesService } from '../../src/modules/resources/resources.service';
import { AuditService } from '../../src/modules/audit/audit.service';
import { NotificationsService } from '../../src/modules/notifications/notifications.service';

import { Reservation } from '../../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../../src/modules/reservations/entities/reservation-log.entity';
import { Resource } from '../../src/modules/resources/entities/resource.entity';
import { Sede } from '../../src/modules/resources/entities/sede.entity';
import { ResourceSchedule } from '../../src/modules/resources/entities/resource-schedule.entity';
import { ResourceException } from '../../src/modules/resources/entities/resource-exception.entity';
import { Payment } from '../../src/modules/payments/entities/payment.entity';
import { AuditLog } from '../../src/modules/audit/entities/audit-log.entity';

// Mock no-op de notificaciones: los tests NO deben tocar el servidor SMTP.
const notificationsMock = {
  sendReservationStatusEmail: jest.fn().mockResolvedValue(undefined),
};

// Levanta un módulo Nest mínimo con la BD de TEST real y el ReservationsService
// real. Solo se sustituye NotificationsService por un no-op.
export async function createTestModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [
      TypeOrmModule.forRoot(testDataSourceOptions),
      TypeOrmModule.forFeature([
        Reservation,
        ReservationLog,
        Resource,
        Sede,
        ResourceSchedule,
        ResourceException,
        Payment,
        AuditLog,
      ]),
    ],
    providers: [
      ReservationsService,
      PaymentsService,
      ResourcesService,
      AuditService,
      { provide: NotificationsService, useValue: notificationsMock },
    ],
  }).compile();
}

export { notificationsMock };
