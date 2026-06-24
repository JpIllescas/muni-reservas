import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../src/modules/reservations/entities/reservation-log.entity';
import { UpdateReservationStatusDto } from '../src/modules/reservations/dto/update-reservation-status.dto';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
import { Role } from '../src/common/enums/role.enum';
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
  createRanchResource,
  createReservation,
  createSchedule,
  asAuthUser,
} from './utils/fixtures';

const statusDto = (status: ReservationStatus): UpdateReservationStatusDto =>
  ({ status }) as UpdateReservationStatusDto;

// FLO-1 — Recurso de confirmación por llamada (requiresVoucher=false): el admin
// aprueba directo desde pending_payment SIN boleta, y la reserva no auto-expira.
// La cara de denegación (recurso que SÍ exige boleta) la cubren los tests de
// reservations-update-status (usan cancha con requiresVoucher=true por defecto).
describe('FLO-1 — recurso sin comprobante (e2e, BD real)', () => {
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

  it('updateStatus: aprueba pending_payment → approved SIN pago si el recurso no exige boleta', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN, isSuperAdmin: true });
    const citizen = await createUser(ds);
    const ranch = await createRanchResource(ds, { requiresVoucher: false });
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: ranch.id,
      reservationDate: '2099-01-01',
      status: ReservationStatus.PENDING_PAYMENT,
    });

    const result = await service.updateStatus(
      r.id,
      statusDto(ReservationStatus.APPROVED),
      asAuthUser(admin, { isSuperAdmin: true }),
    );
    expect(result?.status).toBe(ReservationStatus.APPROVED);

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.APPROVED);
    expect(updated?.confirmedAt).not.toBeNull();

    const logs = await ds
      .getRepository(ReservationLog)
      .find({ where: { reservationId: r.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].toStatus).toBe(ReservationStatus.APPROVED);
  });

  it('create: un recurso sin comprobante no recibe paymentDeadline (no auto-expira)', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds, { requiresVoucher: false });
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
    });

    expect(saved.paymentDeadline).toBeNull();
  });
});
