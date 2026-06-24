import { TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { SedesService } from '../src/modules/sedes/sedes.service';
import { Sede } from '../src/modules/resources/entities/sede.entity';
import { Role } from '../src/common/enums/role.enum';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import { createUser, createSede, asAuthUser } from './utils/fixtures';

// ADM-1 Fase 3 — Gestión de sedes y asignación de admins/operadores.
describe('SedesService (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let sedes: SedesService;
  let ds: DataSource;

  beforeAll(async () => {
    moduleRef = await createTestModule();
    sedes = moduleRef.get(SedesService);
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ds);
  });

  // El super-admin que ejecuta las acciones (su id se usa en la auditoría).
  async function boss() {
    const u = await createUser(ds, { role: Role.ADMIN, isSuperAdmin: true });
    return asAuthUser(u, { isSuperAdmin: true });
  }

  it('create: persiste la sede', async () => {
    const saved = await sedes.create({ name: 'Sede Nueva' }, await boss());

    const fromDb = await ds.getRepository(Sede).findOneBy({ id: saved.id });
    expect(fromDb?.name).toBe('Sede Nueva');
  });

  it('assignUser: asigna un operador y aparece en listUsers', async () => {
    const sede = await createSede(ds);
    const operator = await createUser(ds, { role: Role.OPERATOR });

    await sedes.assignUser(sede.id, operator.id, await boss());

    const users = await sedes.listUsers(sede.id);
    expect(users).toHaveLength(1);
    expect(users[0].id).toBe(operator.id);
  });

  it('assignUser: es idempotente (doble asignación no rompe ni duplica)', async () => {
    const sede = await createSede(ds);
    const operator = await createUser(ds, { role: Role.OPERATOR });
    const actor = await boss();

    await sedes.assignUser(sede.id, operator.id, actor);
    // Segunda vez: NO debe lanzar 23505 ni crear un segundo vínculo.
    const second = await sedes.assignUser(sede.id, operator.id, actor);
    expect(second.message).toMatch(/ya estaba/i);

    const users = await sedes.listUsers(sede.id);
    expect(users).toHaveLength(1);
  });

  it('assignUser: rechaza asignar a un ciudadano', async () => {
    const sede = await createSede(ds);
    const citizen = await createUser(ds); // role CITIZEN por defecto

    await expect(
      sedes.assignUser(sede.id, citizen.id, await boss()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assignUser: usuario inexistente → NotFound', async () => {
    const sede = await createSede(ds);

    await expect(
      sedes.assignUser(
        sede.id,
        '99999999-9999-4999-8999-999999999999',
        await boss(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('removeUser: quita la asignación', async () => {
    const sede = await createSede(ds);
    const operator = await createUser(ds, { role: Role.OPERATOR });
    const actor = await boss();

    await sedes.assignUser(sede.id, operator.id, actor);
    await sedes.removeUser(sede.id, operator.id, actor);

    const users = await sedes.listUsers(sede.id);
    expect(users).toHaveLength(0);
  });
});
