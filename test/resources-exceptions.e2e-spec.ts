import { TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ResourcesService } from '../src/modules/resources/resources.service';
import { ResourceException } from '../src/modules/resources/entities/resource-exception.entity';
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

// Fecha futura para bloquear (addException rechaza fechas pasadas).
const DATE = '2099-01-05';

// REC-1 — Gestión de fechas bloqueadas (CRUD de excepciones).
describe('resource exceptions — REC-1 (e2e, BD real)', () => {
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

  it('bloquea una fecha y la lista en getExceptions', async () => {
    const court = await createCourtResource(ds);

    const created = await service.addException(
      court.id,
      { exceptionDate: DATE, reason: 'Feriado' },
      await adminAuth(),
    );
    expect(created.id).toBeDefined();

    const list = await service.getExceptions(court.id, await adminAuth());
    expect(list).toHaveLength(1);
    expect(list[0].reason).toBe('Feriado');
  });

  it('rechaza bloquear una fecha en el pasado', async () => {
    const court = await createCourtResource(ds);

    await expect(
      service.addException(
        court.id,
        { exceptionDate: '2000-01-01', reason: 'Pasado' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza bloquear una fecha ya bloqueada (duplicada)', async () => {
    const court = await createCourtResource(ds);
    await service.addException(
      court.id,
      { exceptionDate: DATE, reason: 'Feriado' },
      await adminAuth(),
    );

    await expect(
      service.addException(
        court.id,
        { exceptionDate: DATE, reason: 'Otra vez' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza bloquear si la fecha tiene reservas activas', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: DATE,
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });

    await expect(
      service.addException(
        court.id,
        { exceptionDate: DATE, reason: 'Feriado' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('desbloquea una fecha con removeException', async () => {
    const court = await createCourtResource(ds);
    const created = await service.addException(
      court.id,
      { exceptionDate: DATE, reason: 'Feriado' },
      await adminAuth(),
    );

    await service.removeException(created.id, await adminAuth());

    const still = await ds
      .getRepository(ResourceException)
      .findOneBy({ id: created.id });
    expect(still).toBeNull();
  });

  it('un admin sin acceso a la sede del recurso recibe Forbidden (ADM-1)', async () => {
    const court = await createCourtResource(ds);
    const outsider = await createUser(ds, { role: Role.ADMIN });
    const outsiderAuth = asAuthUser(outsider, {
      isSuperAdmin: false,
      sedeIds: ['00000000-0000-0000-0000-000000000000'],
    });

    await expect(
      service.addException(
        court.id,
        { exceptionDate: DATE, reason: 'Feriado' },
        outsiderAuth,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
