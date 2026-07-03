import { TestingModule } from '@nestjs/testing';
import { DataSource, EntitySubscriberInterface } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../src/modules/reservations/entities/reservation-log.entity';
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

// Test #5 — ATOMICIDAD / ROLLBACK.
//
// create() guarda la Reservation y, dentro de la MISMA transacción, su
// ReservationLog. Si el log falla, NADA debe persistir. Para forzar el fallo sin
// tocar el código de producción inyectamos en runtime un EntitySubscriber que
// lanza en el beforeInsert de ReservationLog. Como la reserva se guarda ANTES que
// el log, el throw provoca el rollback de ambos → 0 reservas en la BD.
//
// Va en su propio archivo para que su DataSource (con el subscriber inyectado)
// quede aislado del resto de los e2e.
class FailingLogSubscriber implements EntitySubscriberInterface<ReservationLog> {
  listenTo() {
    return ReservationLog;
  }
  beforeInsert() {
    throw new Error(
      'Fallo inyectado al insertar ReservationLog (test de rollback).',
    );
  }
}

describe('Atomicidad de create() — rollback si falla el log (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let service: ReservationsService;
  let ds: DataSource;
  const subscriber = new FailingLogSubscriber();

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

  it('si el INSERT del ReservationLog falla, la Reservation no persiste (rollback)', async () => {
    const user = await createUser(ds);
    const court = await createCourtResource(ds);

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
      contactName: 'Encargado Test',
      contactPhone: '55556666',
    };

    // Enganchamos el subscriber justo antes de la llamada y lo quitamos SIEMPRE
    // en el finally, para no envenenar otras corridas si algo revienta.
    ds.subscribers.push(subscriber);
    let captured: unknown;
    try {
      await service.create(user.id, dto);
    } catch (err) {
      captured = err;
    } finally {
      const i = ds.subscribers.indexOf(subscriber);
      if (i !== -1) ds.subscribers.splice(i, 1);
    }

    // El create() DEBE haber fallado (si no, el subscriber no se enganchó y el
    // test no estaría probando nada).
    expect(captured).toBeDefined();

    // La verdad ACID: ni la reserva ni el log quedaron escritos.
    const reservations = await ds.getRepository(Reservation).count();
    expect(reservations).toBe(0);

    const logs = await ds.getRepository(ReservationLog).count();
    expect(logs).toBe(0);
  });
});
