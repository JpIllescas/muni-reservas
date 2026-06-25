import { TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ResourcesService } from '../src/modules/resources/resources.service';
import { Resource } from '../src/modules/resources/entities/resource.entity';
import { CreateResourceDto } from '../src/modules/resources/dto/create-resource.dto';
import { ResourceType } from '../src/common/enums/resource-type.enum';
import { UpdateResourceDto } from '../src/modules/resources/dto/update-resource.dto';
import { Role } from '../src/common/enums/role.enum';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createSede,
  createCourtResource,
  asAuthUser,
} from './utils/fixtures';

const courtDto = (sedeId: string): CreateResourceDto =>
  ({
    name: 'Cancha nueva',
    sedeId,
    type: ResourceType.COURT,
    pricePerUnit: 50,
  }) as CreateResourceDto;

// ADM-1 Fase 2 — Alcance por sede en el surface de ESCRITURA de recursos.
// Cubre la regresión de `create` (sede_id NOT NULL) y la autorización por sede
// en create/update/toggleActive/findAllAdmin.
describe('Recursos — alcance por sede (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let resources: ResourcesService;
  let ds: DataSource;

  beforeAll(async () => {
    moduleRef = await createTestModule();
    resources = moduleRef.get(ResourcesService);
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ds);
  });

  it('create: un admin crea un recurso en su propia sede (persiste sede_id)', async () => {
    const sedeA = await createSede(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });
    const auth = asAuthUser(admin, { sedeIds: [sedeA.id] });

    const saved = await resources.create(courtDto(sedeA.id), auth);

    const fromDb = await ds.getRepository(Resource).findOneBy({ id: saved.id });
    expect(fromDb?.sedeId).toBe(sedeA.id);
  });

  it('create: un admin NO puede crear en una sede que no es suya (Forbidden)', async () => {
    const sedeA = await createSede(ds);
    const sedeB = await createSede(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });
    const auth = asAuthUser(admin, { sedeIds: [sedeA.id] });

    await expect(
      resources.create(courtDto(sedeB.id), auth),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('create: el super-admin puede crear en cualquier sede', async () => {
    const sedeB = await createSede(ds);
    const boss = await createUser(ds, { role: Role.ADMIN, isSuperAdmin: true });
    const auth = asAuthUser(boss, { isSuperAdmin: true });

    const saved = await resources.create(courtDto(sedeB.id), auth);
    expect(saved.sedeId).toBe(sedeB.id);
  });

  it('create: sede inexistente → BadRequest', async () => {
    const boss = await createUser(ds, { role: Role.ADMIN, isSuperAdmin: true });
    const auth = asAuthUser(boss, { isSuperAdmin: true });

    await expect(
      resources.create(courtDto('99999999-9999-4999-8999-999999999999'), auth),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('findAllAdmin: el admin solo ve recursos de sus sedes', async () => {
    const sedeA = await createSede(ds);
    const sedeB = await createSede(ds);
    const courtA = await createCourtResource(ds, { sedeId: sedeA.id });
    await createCourtResource(ds, { sedeId: sedeB.id });
    const admin = await createUser(ds, { role: Role.ADMIN });

    const list = await resources.findAllAdmin(
      asAuthUser(admin, { sedeIds: [sedeA.id] }),
    );

    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(courtA.id);
  });

  it('update/toggleActive: no se puede tocar un recurso de otra sede (Forbidden)', async () => {
    const sedeA = await createSede(ds);
    const sedeB = await createSede(ds);
    const courtB = await createCourtResource(ds, { sedeId: sedeB.id });
    const admin = await createUser(ds, { role: Role.ADMIN });
    const auth = asAuthUser(admin, { sedeIds: [sedeA.id] });

    await expect(
      resources.update(courtB.id, { name: 'hack' } as UpdateResourceDto, auth),
    ).rejects.toBeInstanceOf(ForbiddenException);

    await expect(
      resources.toggleActive(courtB.id, auth),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
