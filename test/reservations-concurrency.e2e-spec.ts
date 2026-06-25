import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
import {
  guatemalaNow,
  addDaysToISODate,
  dayOfWeekFromISODate,
} from '../src/common/utils/date.utils';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createCourtResource,
  createSchedule,
} from './utils/fixtures';

// Test #4 — CONCURRENCIA (el de mayor peso para la defensa).
//
// Dos ciudadanos DISTINTOS intentan reservar EXACTAMENTE el mismo slot del mismo
// recurso al mismo tiempo (Promise.all sobre ReservationsService.create()). El
// bloqueo pesimista sobre la fila del recurso serializa las dos transacciones, y
// el backstop a nivel BD (excl_court_overlap) es la red final. Resultado correcto:
// exactamente UNA reserva persiste.
//
// Usamos dos usuarios distintos a propósito: así la colisión es por solapamiento
// de horario (la garantía que nos importa) y NO por el límite de 1 reserva por
// usuario por día.
describe('Concurrencia de create() — doble booking (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let service: ReservationsService;
  let ds: DataSource;

  beforeAll(async () => {
    moduleRef = await createTestModule();
    service = moduleRef.get(ReservationsService);
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ds);
  });

  it('dos create() simultáneos sobre el mismo slot → solo 1 reserva persiste', async () => {
    const userA = await createUser(ds);
    const userB = await createUser(ds);
    const court = await createCourtResource(ds);

    // Fecha futura (dentro de advanceDays=7) con un horario activo para su día.
    const reservationDate = addDaysToISODate(guatemalaNow().date, 2);
    const dayOfWeek = dayOfWeekFromISODate(reservationDate);
    await createSchedule(ds, court.id, dayOfWeek, {
      openTime: '08:00',
      closeTime: '20:00',
    });

    const dto = {
      resourceId: court.id,
      reservationDate,
      startTime: '10:00',
      endTime: '11:00',
    };

    // Disparamos las dos creaciones a la vez.
    const results = await Promise.allSettled([
      service.create(userA.id, dto),
      service.create(userB.id, dto),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    // Exactamente una gana; la otra es rechazada. NO afirmamos el tipo de error:
    // según la carrera puede ser el BadRequestException del chequeo de solapamiento
    // o el 23P01 del backstop de BD; ambos son resultados válidos.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Y la verdad de fondo: una sola fila activa en la BD para ese slot.
    const activeCount = await ds
      .getRepository(Reservation)
      .createQueryBuilder('r')
      .where('r.resourceId = :resourceId', { resourceId: court.id })
      .andWhere('r.reservationDate = :date', { date: reservationDate })
      .andWhere('r.status NOT IN (:...statuses)', {
        statuses: [
          ReservationStatus.CANCELLED,
          ReservationStatus.EXPIRED,
          ReservationStatus.REJECTED,
        ],
      })
      .getCount();

    expect(activeCount).toBe(1);
  });
});
