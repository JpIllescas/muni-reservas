import { TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ResourcesService } from '../src/modules/resources/resources.service';
import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { ResourceStatus } from '../src/common/enums/resource-status.enum';
import { Role } from '../src/common/enums/role.enum';
import {
  dayOfWeekFromISODate,
  guatemalaNow,
  addDaysToISODate,
} from '../src/common/utils/date.utils';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createCourtResource,
  createSchedule,
  asAuthUser,
} from './utils/fixtures';

const DATE = '2099-01-05';

// REC-2 — Estado operativo del recurso (maintenance / event). No toca isActive:
// solo bloquea reservas nuevas (vía getAvailability y create()).
describe('resource status — REC-2 (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let service: ResourcesService;
  let reservations: ReservationsService;
  let ds: DataSource;

  beforeAll(async () => {
    moduleRef = await createTestModule();
    service = moduleRef.get(ResourcesService);
    reservations = moduleRef.get(ReservationsService);
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

  it('pone el recurso en MAINTENANCE con su motivo', async () => {
    const court = await createCourtResource(ds);

    const saved = await service.updateStatus(
      court.id,
      { status: ResourceStatus.MAINTENANCE, statusReason: 'Cancha en reparación' },
      await adminAuth(),
    );

    expect(saved.status).toBe(ResourceStatus.MAINTENANCE);
    expect(saved.statusReason).toBe('Cancha en reparación');
  });

  it('al volver a AVAILABLE limpia el motivo aunque se envíe uno', async () => {
    const court = await createCourtResource(ds, {
      status: ResourceStatus.MAINTENANCE,
      statusReason: 'Cerrada',
    });

    const saved = await service.updateStatus(
      court.id,
      { status: ResourceStatus.AVAILABLE, statusReason: 'ignorar' },
      await adminAuth(),
    );

    expect(saved.status).toBe(ResourceStatus.AVAILABLE);
    expect(saved.statusReason).toBeNull();
  });

  it('un recurso en MAINTENANCE queda cerrado en getAvailability aunque tenga horario', async () => {
    const court = await createCourtResource(ds);
    // Horario activo ese día: el ÚNICO motivo de cierre será el estado operativo.
    await createSchedule(ds, court.id, dayOfWeekFromISODate(DATE));
    await service.updateStatus(
      court.id,
      { status: ResourceStatus.MAINTENANCE, statusReason: 'Torneo' },
      await adminAuth(),
    );

    const availability = await service.getAvailability(court.id, DATE);
    expect(availability.closed).toBe(true);
    expect(availability.status).toBe(ResourceStatus.MAINTENANCE);
    expect(availability.reason).toBe('Torneo');
  });

  it('un recurso en MAINTENANCE bloquea la creación de una reserva nueva', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    // Fecha válida DENTRO de advanceDays: así el rechazo se debe SOLO al estado
    // operativo, no al chequeo de anticipación (que también daría BadRequest).
    const near = addDaysToISODate(guatemalaNow().date, 2);
    await createSchedule(ds, court.id, dayOfWeekFromISODate(near));
    await service.updateStatus(
      court.id,
      { status: ResourceStatus.MAINTENANCE, statusReason: 'Reparación' },
      await adminAuth(),
    );

    await expect(
      reservations.create(citizen.id, {
        resourceId: court.id,
        reservationDate: near,
        startTime: '10:00',
        endTime: '11:00',
        contactName: 'Encargado',
        contactPhone: '12345678',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un admin sin acceso a la sede del recurso recibe Forbidden (ADM-1)', async () => {
    const court = await createCourtResource(ds);
    const outsider = await createUser(ds, { role: Role.ADMIN });
    const outsiderAuth = asAuthUser(outsider, {
      isSuperAdmin: false,
      sedeIds: ['00000000-0000-0000-0000-000000000000'],
    });

    await expect(
      service.updateStatus(
        court.id,
        { status: ResourceStatus.MAINTENANCE },
        outsiderAuth,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
