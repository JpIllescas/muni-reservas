import { TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../src/modules/reservations/entities/reservation-log.entity';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
import { Role } from '../src/common/enums/role.enum';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createCourtResource,
  createReservation,
  asAuthUser,
} from './utils/fixtures';

// RES-1 — Revertir un rechazo (solo admin), únicamente si el horario sigue libre.
describe('revertRejection — RES-1 (e2e, BD real)', () => {
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

  async function adminAuth() {
    const u = await createUser(ds, { role: Role.ADMIN, isSuperAdmin: true });
    return asAuthUser(u, { isSuperAdmin: true });
  }

  it('revierte un rechazo al estado previo (del log) cuando el slot sigue libre', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: '2099-01-05',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.REJECTED,
      rejectionReason: 'Rechazada por error',
    });
    // Log del rechazo: venía de UNDER_REVIEW → ahí debe volver.
    await ds.getRepository(ReservationLog).save({
      reservationId: r.id,
      fromStatus: ReservationStatus.UNDER_REVIEW,
      toStatus: ReservationStatus.REJECTED,
      changedById: null,
      reason: 'rechazo',
    });

    const result = await service.revertRejection(r.id, await adminAuth());
    expect(result?.status).toBe(ReservationStatus.UNDER_REVIEW);

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.UNDER_REVIEW);
    expect(updated?.rejectionReason).toBeNull();

    const revertLog = await ds.getRepository(ReservationLog).findOne({
      where: {
        reservationId: r.id,
        fromStatus: ReservationStatus.REJECTED,
        toStatus: ReservationStatus.UNDER_REVIEW,
      },
    });
    expect(revertLog).not.toBeNull();
  });

  it('NO revierte si el horario ya fue tomado por otra reserva activa', async () => {
    const citizenA = await createUser(ds);
    const citizenB = await createUser(ds);
    const court = await createCourtResource(ds);

    const rejected = await createReservation(ds, {
      userId: citizenA.id,
      resourceId: court.id,
      reservationDate: '2099-01-05',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.REJECTED,
    });
    // Otra reserva ACTIVA ocupó el mismo slot (REJECTED es inactivo, conviven en BD).
    await createReservation(ds, {
      userId: citizenB.id,
      resourceId: court.id,
      reservationDate: '2099-01-05',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.UNDER_REVIEW,
    });

    await expect(
      service.revertRejection(rejected.id, await adminAuth()),
    ).rejects.toBeInstanceOf(BadRequestException);

    const updated = await ds
      .getRepository(Reservation)
      .findOneBy({ id: rejected.id });
    expect(updated?.status).toBe(ReservationStatus.REJECTED);
  });

  it('rechaza revertir una reserva que no está rechazada', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: '2099-01-05',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });

    await expect(
      service.revertRejection(r.id, await adminAuth()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
