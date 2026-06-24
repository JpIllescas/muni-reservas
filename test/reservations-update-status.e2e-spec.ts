import { TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../src/modules/reservations/entities/reservation-log.entity';
import { UpdateReservationStatusDto } from '../src/modules/reservations/dto/update-reservation-status.dto';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
import { Role } from '../src/common/enums/role.enum';

// `reason` es opcional en la validación (@IsOptional) pero requerido en el tipo
// TS; este helper arma el DTO sin tener que pasar reason en cada llamada.
const statusDto = (status: ReservationStatus): UpdateReservationStatusDto =>
  ({ status }) as UpdateReservationStatusDto;

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createCourtResource,
  createReservation,
  createPayment,
  asAuthUser,
} from './utils/fixtures';

// Test #2 — MÁQUINA DE ESTADOS de updateStatus().
//
// Cubre las tres reglas del método (reservations.service.ts):
//   1. Transición inválida → BadRequestException y nada cambia.
//   2. Aprobar sin un Payment registrado → BadRequestException.
//   3. Transición válida con pago → persiste estado + confirmedAt + log inmutable.
describe('updateStatus — máquina de estados (e2e, BD real)', () => {
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

  it('rechaza una transición inválida (PENDING_PAYMENT → APPROVED) y no cambia nada', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.PENDING_PAYMENT,
    });

    await expect(
      service.updateStatus(
        r.id,
        statusDto(ReservationStatus.APPROVED),
        asAuthUser(admin, { isSuperAdmin: true }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // El estado sigue intacto y NO se creó log.
    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.PENDING_PAYMENT);

    const logs = await ds
      .getRepository(ReservationLog)
      .countBy({ reservationId: r.id });
    expect(logs).toBe(0);
  });

  it('no permite aprobar (UNDER_REVIEW → APPROVED) sin un pago registrado', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.UNDER_REVIEW,
    });

    await expect(
      service.updateStatus(
        r.id,
        statusDto(ReservationStatus.APPROVED),
        asAuthUser(admin, { isSuperAdmin: true }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.UNDER_REVIEW);
    expect(updated?.confirmedAt).toBeNull();
  });

  it('aprueba (UNDER_REVIEW → APPROVED) con pago: persiste estado, confirmedAt y log', async () => {
    const admin = await createUser(ds, { role: Role.ADMIN });
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.UNDER_REVIEW,
    });
    await createPayment(ds, r.id);

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
    expect(logs[0].fromStatus).toBe(ReservationStatus.UNDER_REVIEW);
    expect(logs[0].toStatus).toBe(ReservationStatus.APPROVED);
    expect(logs[0].changedById).toBe(admin.id);
  });
});
