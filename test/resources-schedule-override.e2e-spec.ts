import { TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ResourcesService } from '../src/modules/resources/resources.service';
import { ReservationsService } from '../src/modules/reservations/reservations.service';
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
  createSchedule,
  asAuthUser,
} from './utils/fixtures';

// REC-3 — Horario especial / override por fecha. Gana sobre el semanal ESE día;
// el bloqueo (REC-1) tiene mayor precedencia. Fechas cercanas (dentro de
// advanceDays) para que create() no rebote por anticipación.
describe('schedule override — REC-3 (e2e, BD real)', () => {
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

  // Fecha cercana (hoy + 2) para todos los flujos con create().
  function nearDate(): string {
    return addDaysToISODate(guatemalaNow().date, 2);
  }

  const CONTACT = { contactName: 'Encargado', contactPhone: '12345678' };

  it('un override abre un día normalmente cerrado y permite crear la reserva (rancho)', async () => {
    const citizen = await createUser(ds);
    const ranch = await createRanchResource(ds);
    const date = nearDate();
    // Sin ResourceSchedule para ese día → normalmente cerrado. El override lo abre.
    await service.addScheduleOverride(
      ranch.id,
      { overrideDate: date, openTime: '08:00', closeTime: '17:00' },
      await adminAuth(),
    );

    const result = await reservations.create(citizen.id, {
      resourceId: ranch.id,
      reservationDate: date,
      ...CONTACT,
    });

    expect(result.id).toBeDefined();
    expect(result.reservationDate).toBe(date);
  });

  it('un override que estrecha las horas se aplica en create() (fuera → 400, dentro → OK) (cancha)', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const date = nearDate();
    // Semanal amplio 08–20, pero ese día el override lo estrecha a 08–12.
    await createSchedule(ds, court.id, dayOfWeekFromISODate(date));
    await service.addScheduleOverride(
      court.id,
      {
        overrideDate: date,
        openTime: '08:00',
        closeTime: '12:00',
        slotDurationMin: 60,
      },
      await adminAuth(),
    );

    // 13–14 está dentro del semanal pero FUERA del override → rechazado.
    await expect(
      reservations.create(citizen.id, {
        resourceId: court.id,
        reservationDate: date,
        startTime: '13:00',
        endTime: '14:00',
        ...CONTACT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    // 09–10 cae dentro del override → permitido.
    const ok = await reservations.create(citizen.id, {
      resourceId: court.id,
      reservationDate: date,
      startTime: '09:00',
      endTime: '10:00',
      ...CONTACT,
    });
    expect(ok.id).toBeDefined();
  });

  it('un bloqueo (REC-1) gana al override: la fecha sigue cerrada', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds);
    const date = nearDate();
    await createSchedule(ds, court.id, dayOfWeekFromISODate(date));
    // Misma fecha con override Y bloqueo: el bloqueo tiene precedencia.
    await service.addScheduleOverride(
      court.id,
      {
        overrideDate: date,
        openTime: '08:00',
        closeTime: '12:00',
        slotDurationMin: 60,
      },
      await adminAuth(),
    );
    await service.addException(
      court.id,
      { exceptionDate: date, reason: 'Feriado' },
      await adminAuth(),
    );

    // getAvailability: cerrado con el motivo de la excepción.
    const availability = await service.getAvailability(court.id, date);
    expect(availability.closed).toBe(true);
    expect(availability.reason).toBe('Feriado');

    // create() también rechaza (el guard de excepción corre antes).
    await expect(
      reservations.create(citizen.id, {
        resourceId: court.id,
        reservationDate: date,
        startTime: '09:00',
        endTime: '10:00',
        ...CONTACT,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('getAvailability refleja las horas del override, no las del semanal (cancha)', async () => {
    const court = await createCourtResource(ds);
    const date = nearDate();
    await createSchedule(ds, court.id, dayOfWeekFromISODate(date)); // 08–20
    await service.addScheduleOverride(
      court.id,
      {
        overrideDate: date,
        openTime: '08:00',
        closeTime: '12:00',
        slotDurationMin: 60,
      },
      await adminAuth(),
    );

    const availability = await service.getAvailability(court.id, date);
    expect(availability.closed).toBe(false);
    expect(availability.schedule?.openTime?.slice(0, 5)).toBe('08:00');
    expect(availability.schedule?.closeTime?.slice(0, 5)).toBe('12:00');
  });

  it('rechaza definir un override en una fecha pasada', async () => {
    const court = await createCourtResource(ds);

    await expect(
      service.addScheduleOverride(
        court.id,
        { overrideDate: '2000-01-01', openTime: '08:00', closeTime: '12:00' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un segundo override para la misma fecha (duplicado)', async () => {
    const court = await createCourtResource(ds);
    const date = nearDate();
    await service.addScheduleOverride(
      court.id,
      { overrideDate: date, openTime: '08:00', closeTime: '12:00' },
      await adminAuth(),
    );

    await expect(
      service.addScheduleOverride(
        court.id,
        { overrideDate: date, openTime: '14:00', closeTime: '18:00' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza apertura >= cierre', async () => {
    const court = await createCourtResource(ds);
    const date = nearDate();

    await expect(
      service.addScheduleOverride(
        court.id,
        { overrideDate: date, openTime: '12:00', closeTime: '08:00' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('elimina un override y la disponibilidad vuelve al semanal', async () => {
    const court = await createCourtResource(ds);
    const date = nearDate();
    await createSchedule(ds, court.id, dayOfWeekFromISODate(date)); // 08–20
    const override = await service.addScheduleOverride(
      court.id,
      {
        overrideDate: date,
        openTime: '08:00',
        closeTime: '12:00',
        slotDurationMin: 60,
      },
      await adminAuth(),
    );

    await service.removeScheduleOverride(override.id, await adminAuth());

    // Sin override, gana el semanal (08–20).
    const availability = await service.getAvailability(court.id, date);
    expect(availability.closed).toBe(false);
    expect(availability.schedule?.closeTime?.slice(0, 5)).toBe('20:00');
  });

  it('un admin sin acceso a la sede del recurso recibe Forbidden (ADM-1)', async () => {
    const court = await createCourtResource(ds);
    const outsider = await createUser(ds, { role: Role.ADMIN });
    const outsiderAuth = asAuthUser(outsider, {
      isSuperAdmin: false,
      sedeIds: ['00000000-0000-0000-0000-000000000000'],
    });

    await expect(
      service.addScheduleOverride(
        court.id,
        { overrideDate: nearDate(), openTime: '08:00', closeTime: '12:00' },
        outsiderAuth,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
