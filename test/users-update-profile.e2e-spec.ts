import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { UsersService } from '../src/modules/users/users.service';
import { User } from '../src/modules/users/entities/user.entity';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import { createUser } from './utils/fixtures';

// USR-1 — Perfil editable, pero el DPI es inmutable ("todos menos DPI"). El bloqueo
// se ejerce en el servicio (asignación explícita), no solo en el DTO, así que es
// verificable a este nivel aunque el ValidationPipe no intervenga.
describe('updateProfile — USR-1 (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let service: UsersService;
  let ds: DataSource;

  beforeAll(async () => {
    moduleRef = await createTestModule();
    service = moduleRef.get(UsersService);
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ds);
  });

  it('NO cambia el DPI aunque venga en el payload, y sí edita lo demás', async () => {
    const user = await createUser(ds, {
      dpi: '1234567890101',
      phone: '88887777',
    });

    await service.updateProfile(user.id, {
      dpi: '9999999999999',
      fullName: 'Nombre Editado',
    } as any);

    const updated = await ds.getRepository(User).findOne({
      where: { id: user.id },
      select: ['id', 'fullName', 'dpi', 'phone'],
    });
    expect(updated?.dpi).toBe('1234567890101'); // DPI intacto
    expect(updated?.fullName).toBe('Nombre Editado');
  });

  it('un update parcial no borra los campos no enviados', async () => {
    const user = await createUser(ds, {
      dpi: '1234567890101',
      phone: '88887777',
    });

    await service.updateProfile(user.id, { fullName: 'Solo Nombre' } as any);

    const updated = await ds.getRepository(User).findOne({
      where: { id: user.id },
      select: ['id', 'fullName', 'dpi', 'phone'],
    });
    expect(updated?.fullName).toBe('Solo Nombre');
    expect(updated?.phone).toBe('88887777'); // intacto
    expect(updated?.dpi).toBe('1234567890101'); // intacto
  });

  it('edita el teléfono cuando viene en el payload', async () => {
    const user = await createUser(ds, { phone: '88887777' });

    await service.updateProfile(user.id, { phone: '11112222' } as any);

    const updated = await ds.getRepository(User).findOne({
      where: { id: user.id },
      select: ['id', 'phone'],
    });
    expect(updated?.phone).toBe('11112222');
  });
});
