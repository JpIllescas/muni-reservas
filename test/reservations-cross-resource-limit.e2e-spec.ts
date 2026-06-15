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
import { createUser, createCourtResource, createSchedule } from './utils/fixtures';

// Test #6 — LÍMITE "1 cancha por usuario por día" bajo concurrencia CROSS-RESOURCE.
//
// El MISMO usuario intenta reservar dos canchas DISTINTAS para el MISMO día al
// mismo tiempo. El lock pesimista sobre la fila del recurso NO sirve aquí (cada
// transacción bloquea un Resource diferente), así que la protección depende del
// advisory lock por (usuario, fecha) dentro de create(). Resultado correcto:
// exactamente UNA reserva persiste para ese usuario ese día.
describe('Límite diario de canchas cross-resource (e2e, BD real)', () => {
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

  it('mismo usuario, dos canchas distintas, mismo día, en paralelo → solo 1 reserva', async () => {
    const user = await createUser(ds);
    const courtA = await createCourtResource(ds);
    const courtB = await createCourtResource(ds);

    const reservationDate = addDaysToISODate(guatemalaNow().date, 2);
    const dayOfWeek = dayOfWeekFromISODate(reservationDate);
    await createSchedule(ds, courtA.id, dayOfWeek, {
      openTime: '08:00',
      closeTime: '20:00',
    });
    await createSchedule(ds, courtB.id, dayOfWeek, {
      openTime: '08:00',
      closeTime: '20:00',
    });

    // Mismo usuario, mismo día, canchas distintas → choca con el límite diario,
    // no con el solapamiento de horario ni con el backstop de BD.
    const results = await Promise.allSettled([
      service.create(user.id, {
        resourceId: courtA.id,
        reservationDate,
        startTime: '10:00',
        endTime: '11:00',
      }),
      service.create(user.id, {
        resourceId: courtB.id,
        reservationDate,
        startTime: '10:00',
        endTime: '11:00',
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // Verdad de fondo: el usuario tiene UNA sola cancha activa ese día.
    const activeCount = await ds
      .getRepository(Reservation)
      .createQueryBuilder('r')
      .where('r.userId = :userId', { userId: user.id })
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
