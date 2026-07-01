import { TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../src/modules/reservations/entities/reservation-log.entity';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
import { Role } from '../src/common/enums/role.enum';
import { dayOfWeekFromISODate } from '../src/common/utils/date.utils';

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

// DATE = slot original de la reserva; TARGET = slot propuesto por la
// administración. Días de semana distintos (consecutivos) → cada uno fija su
// propio ResourceSchedule. Año futuro para que nunca sean fechas pasadas.
const DATE = '2099-01-05';
const TARGET = '2099-01-06';

// RES-3 — Reasignación de horario con aprobación del ciudadano (Shape B).
describe('reassignment — RES-3 (e2e, BD real)', () => {
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

  // Admin super (sede-agnóstico) para las llamadas de propose del happy path.
  async function adminAuth() {
    const u = await createUser(ds, { role: Role.ADMIN, isSuperAdmin: true });
    return asAuthUser(u, { isSuperAdmin: true });
  }

  it('propose: guarda proposed_* SIN cambiar el estado ni el slot real', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });

    await service.proposeReassignment(
      r.id,
      {
        proposedDate: TARGET,
        proposedStartTime: '12:00',
        proposedEndTime: '13:00',
      },
      await adminAuth(),
    );

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    // La propuesta se aparta...
    expect(updated?.proposedDate).toBe(TARGET);
    expect(updated?.proposedStartTime?.slice(0, 5)).toBe('12:00');
    expect(updated?.proposedEndTime?.slice(0, 5)).toBe('13:00');
    expect(updated?.proposedBy).not.toBeNull();
    // ...pero el estado y el slot real quedan intactos (no se ocupa el nuevo).
    expect(updated?.status).toBe(ReservationStatus.APPROVED);
    expect(updated?.reservationDate).toBe(DATE);
    expect(updated?.startTime?.slice(0, 5)).toBe('10:00');
  });

  it('accept (rama activa): mueve la reserva al slot propuesto CONSERVANDO el estado', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    await createSchedule(ds, court.id, dayOfWeekFromISODate(TARGET));
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });

    await service.proposeReassignment(
      r.id,
      {
        proposedDate: TARGET,
        proposedStartTime: '12:00',
        proposedEndTime: '13:00',
      },
      await adminAuth(),
    );

    await service.acceptReassignment(r.id, asAuthUser(citizen));

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.reservationDate).toBe(TARGET);
    expect(updated?.startTime?.slice(0, 5)).toBe('12:00');
    expect(updated?.endTime?.slice(0, 5)).toBe('13:00');
    expect(updated?.status).toBe(ReservationStatus.APPROVED); // conserva estado
    // Propuesta limpiada.
    expect(updated?.proposedDate).toBeNull();
    expect(updated?.proposedStartTime).toBeNull();
    expect(updated?.proposedBy).toBeNull();

    // Log del movimiento.
    const log = await ds.getRepository(ReservationLog).findOne({
      where: {
        reservationId: r.id,
        fromStatus: ReservationStatus.APPROVED,
        toStatus: ReservationStatus.APPROVED,
      },
    });
    expect(log).not.toBeNull();
  });

  it('accept (rama revivir): una reserva RECHAZADA vuelve al estado previo al rechazo en el nuevo slot', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    await createSchedule(ds, court.id, dayOfWeekFromISODate(TARGET));
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.REJECTED,
      rejectionReason: 'Rechazada por error',
    });
    // El rechazo venía de UNDER_REVIEW → ahí debe revivir.
    await ds.getRepository(ReservationLog).save({
      reservationId: r.id,
      fromStatus: ReservationStatus.UNDER_REVIEW,
      toStatus: ReservationStatus.REJECTED,
      changedById: null,
      reason: 'rechazo',
    });

    await service.proposeReassignment(
      r.id,
      {
        proposedDate: TARGET,
        proposedStartTime: '14:00',
        proposedEndTime: '15:00',
      },
      await adminAuth(),
    );

    await service.acceptReassignment(r.id, asAuthUser(citizen));

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.UNDER_REVIEW); // revivió
    expect(updated?.reservationDate).toBe(TARGET);
    expect(updated?.startTime?.slice(0, 5)).toBe('14:00');
    expect(updated?.rejectionReason).toBeNull();
    expect(updated?.proposedDate).toBeNull();
  });

  it('accept: falla si el slot propuesto se ocupó en el intervalo; la propuesta y la reserva quedan intactas', async () => {
    const citizen = await createUser(ds);
    const other = await createUser(ds);
    const court = await createCourtResource(ds);
    await createSchedule(ds, court.id, dayOfWeekFromISODate(TARGET));
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });

    await service.proposeReassignment(
      r.id,
      {
        proposedDate: TARGET,
        proposedStartTime: '12:00',
        proposedEndTime: '13:00',
      },
      await adminAuth(),
    );

    // Entre la propuesta y la aceptación, OTRO ciudadano tomó ese slot.
    await createReservation(ds, {
      userId: other.id,
      resourceId: court.id,
      reservationDate: TARGET,
      startTime: '12:00',
      endTime: '13:00',
      status: ReservationStatus.APPROVED,
    });

    await expect(
      service.acceptReassignment(r.id, asAuthUser(citizen)),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Rollback: la reserva no se movió y la propuesta sigue viva.
    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.reservationDate).toBe(DATE);
    expect(updated?.status).toBe(ReservationStatus.APPROVED);
    expect(updated?.proposedDate).toBe(TARGET);
  });

  it('reject: limpia proposed_* y deja la reserva intacta', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });

    await service.proposeReassignment(
      r.id,
      {
        proposedDate: TARGET,
        proposedStartTime: '12:00',
        proposedEndTime: '13:00',
      },
      await adminAuth(),
    );

    await service.rejectReassignment(r.id, asAuthUser(citizen));

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.proposedDate).toBeNull();
    expect(updated?.proposedStartTime).toBeNull();
    expect(updated?.proposedBy).toBeNull();
    // Reserva sin cambios.
    expect(updated?.status).toBe(ReservationStatus.APPROVED);
    expect(updated?.reservationDate).toBe(DATE);
    expect(updated?.startTime?.slice(0, 5)).toBe('10:00');
  });

  it('propose: rechaza una reserva en estado no reasignable (expired)', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.EXPIRED,
    });

    await expect(
      service.proposeReassignment(
        r.id,
        {
          proposedDate: TARGET,
          proposedStartTime: '12:00',
          proposedEndTime: '13:00',
        },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propose: un admin sin acceso a la sede del recurso recibe Forbidden (ADM-1)', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });

    // Admin NO super, con una sede distinta a la del recurso.
    const outsider = await createUser(ds, { role: Role.ADMIN });
    const outsiderAuth = asAuthUser(outsider, {
      isSuperAdmin: false,
      sedeIds: ['00000000-0000-0000-0000-000000000000'],
    });

    await expect(
      service.proposeReassignment(
        r.id,
        {
          proposedDate: TARGET,
          proposedStartTime: '12:00',
          proposedEndTime: '13:00',
        },
        outsiderAuth,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accept (rancho): mueve la reserva de día completo al nuevo día, sin horas', async () => {
    const citizen = await createUser(ds);
    const ranch = await createRanchResource(ds);
    // El chequeo "no atiende ese día" está ANTES del split por tipo → el rancho
    // también necesita un schedule activo para el día destino.
    await createSchedule(ds, ranch.id, dayOfWeekFromISODate(TARGET));
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: ranch.id,
      reservationDate: DATE,
      startTime: null,
      endTime: null,
      status: ReservationStatus.APPROVED,
    });

    // Propuesta de rancho: solo fecha (día completo, sin horas).
    await service.proposeReassignment(
      r.id,
      { proposedDate: TARGET },
      await adminAuth(),
    );

    await service.acceptReassignment(r.id, asAuthUser(citizen));

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.reservationDate).toBe(TARGET);
    expect(updated?.startTime).toBeNull();
    expect(updated?.endTime).toBeNull();
    expect(updated?.status).toBe(ReservationStatus.APPROVED);
    expect(updated?.proposedDate).toBeNull();
  });

  it('accept (rancho): falla si el día destino ya está reservado (unicidad de rancho)', async () => {
    const citizen = await createUser(ds);
    const other = await createUser(ds);
    const ranch = await createRanchResource(ds);
    await createSchedule(ds, ranch.id, dayOfWeekFromISODate(TARGET));
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: ranch.id,
      reservationDate: DATE,
      status: ReservationStatus.APPROVED,
    });

    await service.proposeReassignment(
      r.id,
      { proposedDate: TARGET },
      await adminAuth(),
    );

    // Otro ciudadano ya tomó ese rancho el día destino.
    await createReservation(ds, {
      userId: other.id,
      resourceId: ranch.id,
      reservationDate: TARGET,
      status: ReservationStatus.APPROVED,
    });

    await expect(
      service.acceptReassignment(r.id, asAuthUser(citizen)),
    ).rejects.toBeInstanceOf(BadRequestException);

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.reservationDate).toBe(DATE);
    expect(updated?.proposedDate).toBe(TARGET);
  });

  it('accept: un usuario que no es el dueño recibe Forbidden', async () => {
    const citizen = await createUser(ds);
    const intruder = await createUser(ds);
    const court = await createCourtResource(ds);
    await createSchedule(ds, court.id, dayOfWeekFromISODate(TARGET));
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });

    await service.proposeReassignment(
      r.id,
      {
        proposedDate: TARGET,
        proposedStartTime: '12:00',
        proposedEndTime: '13:00',
      },
      await adminAuth(),
    );

    await expect(
      service.acceptReassignment(r.id, asAuthUser(intruder)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
