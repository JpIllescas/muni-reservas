import { TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ResourcesService } from '../src/modules/resources/resources.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
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

// Fecha futura (misma convención que el spec de REC-1).
const DATE = '2099-01-05';

// REC-4 — Asignación de horario ante imprevistos: el admin lista las reservas
// vivas de un recurso en una fecha (getAffectedReservations) para reasignarlas
// vía RES-3 antes de bloquear el día con addException (REC-1).
describe('affected reservations — REC-4 (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let service: ResourcesService;
  let ds: DataSource;

  beforeAll(async () => {
    moduleRef = await createTestModule();
    service = moduleRef.get(ResourcesService);
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

  it('lista solo las reservas vivas de esa fecha, ordenadas por hora y con el usuario', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);

    // Dos vivas en la fecha (en desorden de hora), una cancelada esa fecha y
    // una viva en OTRA fecha: solo deben volver las dos primeras.
    await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '12:00',
      endTime: '13:00',
      status: ReservationStatus.PENDING_PAYMENT,
    });
    await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });
    await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '14:00',
      endTime: '15:00',
      status: ReservationStatus.CANCELLED,
    });
    await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: '2099-01-06',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });

    const list = await service.getAffectedReservations(
      court.id,
      DATE,
      await adminAuth(),
    );

    expect(list).toHaveLength(2);
    expect(list.map((r) => r.startTime)).toEqual(['10:00:00', '12:00:00']);
    // El admin necesita a quién llamar: la relación user viene cargada.
    expect(list[0].user).toBeDefined();
    expect(list[0].user.email).toBe(citizen.email);
  });

  it('recurso inexistente → NotFound', async () => {
    await expect(
      service.getAffectedReservations(
        '00000000-0000-0000-0000-000000000000',
        DATE,
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('un admin sin acceso a la sede del recurso recibe Forbidden (ADM-1)', async () => {
    const court = await createCourtResource(ds);
    const outsider = await createUser(ds, { role: Role.ADMIN });
    const outsiderAuth = asAuthUser(outsider, {
      isSuperAdmin: false,
      sedeIds: ['00000000-0000-0000-0000-000000000000'],
    });

    await expect(
      service.getAffectedReservations(court.id, DATE, outsiderAuth),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('flujo REC-4: bloquear falla con afectadas; resueltas todas, el bloqueo pasa', async () => {
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

    // Con la reserva viva, REC-1 rechaza el bloqueo.
    await expect(
      service.addException(
        court.id,
        { exceptionDate: DATE, reason: 'Imprevisto' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // El admin la encuentra con el listado y la reasigna vía RES-3; aquí se
    // simula el resultado final de esa reasignación (la reserva quedó en otra fecha).
    const affected = await service.getAffectedReservations(
      court.id,
      DATE,
      await adminAuth(),
    );
    expect(affected.map((x) => x.id)).toEqual([r.id]);

    await ds
      .getRepository(Reservation)
      .update(r.id, { reservationDate: '2099-01-06' });

    // Sin afectadas, el bloqueo ya procede.
    const exception = await service.addException(
      court.id,
      { exceptionDate: DATE, reason: 'Imprevisto' },
      await adminAuth(),
    );
    expect(exception.id).toBeDefined();
  });
});
