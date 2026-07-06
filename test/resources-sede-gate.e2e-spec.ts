import { TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ResourcesService } from '../src/modules/resources/resources.service';
import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { guatemalaNow, addDaysToISODate } from '../src/common/utils/date.utils';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import { createUser, createSede, createRanchResource } from './utils/fixtures';

// Gate de sede (follow-up de ADM-1): una sede inactiva OCULTA sus recursos
// (catálogo y disponibilidad) y no acepta reservas nuevas, SIN cascada sobre
// el isActive de los recursos — al reactivar la sede todo vuelve solo.
// Las reservas vivas no se tocan (misma postura que REC-1/REC-2).
describe('sede gate — sede inactiva (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let resourcesService: ResourcesService;
  let reservationsService: ReservationsService;
  let ds: DataSource;

  beforeAll(async () => {
    moduleRef = await createTestModule();
    resourcesService = moduleRef.get(ResourcesService);
    reservationsService = moduleRef.get(ReservationsService);
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ds);
  });

  it('el catálogo excluye los recursos de una sede inactiva (sin tocar su isActive)', async () => {
    const activa = await createSede(ds);
    const inactiva = await createSede(ds, { isActive: false });
    const visible = await createRanchResource(ds, { sedeId: activa.id });
    const oculto = await createRanchResource(ds, { sedeId: inactiva.id });

    const catalog = await resourcesService.findAll();

    const ids = catalog.map((r) => r.id);
    expect(ids).toContain(visible.id);
    expect(ids).not.toContain(oculto.id);
    // El recurso oculto conserva isActive=true: al reactivar la sede vuelve solo.
    expect(oculto.isActive).toBe(true);
  });

  it('la disponibilidad de un recurso de sede inactiva responde NotFound', async () => {
    const inactiva = await createSede(ds, { isActive: false });
    const ranch = await createRanchResource(ds, { sedeId: inactiva.id });

    await expect(
      resourcesService.getAvailability(ranch.id, '2099-01-05'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create() rechaza reservas nuevas en recursos de sede inactiva', async () => {
    const citizen = await createUser(ds);
    const inactiva = await createSede(ds, { isActive: false });
    const ranch = await createRanchResource(ds, { sedeId: inactiva.id });
    const reservationDate = addDaysToISODate(guatemalaNow().date, 2);

    await expect(
      reservationsService.create(citizen.id, {
        resourceId: ranch.id,
        reservationDate,
        contactName: 'Encargado Test',
        contactPhone: '55556666',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
