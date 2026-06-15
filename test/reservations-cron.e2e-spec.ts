import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../src/modules/reservations/entities/reservation-log.entity';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createCourtResource,
  createReservation,
  createPayment,
} from './utils/fixtures';

// Test de integración contra Postgres REAL (muni_reservas_test).
// Cubre el cron de expiración: ReservationsService.expireOverdueReservations().
describe('Cron expireOverdueReservations (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let service: ReservationsService;
  let ds: DataSource;

  const HOUR = 60 * 60 * 1000;

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

  it('expira una reserva PENDING con deadline vencido y registra el log automático', async () => {
    const user = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: user.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.PENDING_PAYMENT,
      paymentDeadline: new Date(Date.now() - HOUR), // venció hace 1h
    });

    const expiredCount = await service.expireOverdueReservations();

    expect(expiredCount).toBe(1);

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.EXPIRED);

    const logs = await ds.getRepository(ReservationLog).find({
      where: { reservationId: r.id, toStatus: ReservationStatus.EXPIRED },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].fromStatus).toBe(ReservationStatus.PENDING_PAYMENT);
    expect(logs[0].changedById).toBeNull(); // cambio automático del sistema
  });

  it('NO expira una reserva PENDING con deadline en el futuro', async () => {
    const user = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: user.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.PENDING_PAYMENT,
      paymentDeadline: new Date(Date.now() + HOUR), // vence en 1h
    });

    const expiredCount = await service.expireOverdueReservations();

    expect(expiredCount).toBe(0);
    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.PENDING_PAYMENT);
  });

  it('NO toca una reserva que ya está aprobada (aunque el deadline esté vencido)', async () => {
    const user = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: user.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
      paymentDeadline: new Date(Date.now() - HOUR),
    });
    await createPayment(ds, r.id);

    const expiredCount = await service.expireOverdueReservations();

    expect(expiredCount).toBe(0);
    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.APPROVED);
  });
});
