import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
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

// RES-2 — datos de contacto del encargado (nombre + teléfono) persistidos en la
// reserva al crearla.
describe('Contacto del encargado en create() — RES-2 (e2e, BD real)', () => {
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

  it('persiste contactName y contactPhone en la reserva creada', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);

    const reservationDate = addDaysToISODate(guatemalaNow().date, 2);
    const dayOfWeek = dayOfWeekFromISODate(reservationDate);
    await createSchedule(ds, court.id, dayOfWeek, {
      openTime: '08:00',
      closeTime: '20:00',
    });

    const saved = await service.create(citizen.id, {
      resourceId: court.id,
      reservationDate,
      startTime: '10:00',
      endTime: '11:00',
      contactName: 'María del Encargo',
      contactPhone: '55556666',
    });

    const persisted = await ds.getRepository(Reservation).findOne({
      where: { id: saved.id },
      select: ['id', 'contactName', 'contactPhone'],
    });
    expect(persisted?.contactName).toBe('María del Encargo');
    expect(persisted?.contactPhone).toBe('55556666');
  });
});
