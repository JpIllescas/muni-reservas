import { TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { UsersService } from '../src/modules/users/users.service';
import { User } from '../src/modules/users/entities/user.entity';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import { createUser, createUserWithoutDpi } from './utils/fixtures';

// USR-1 — Perfil editable, pero el DPI es de UNA sola escritura: se puede
// ESTABLECER si el registro lo dejó vacío (FEL/CGC), y una vez fijado es
// inmutable (el servicio rechaza cualquier cambio con BadRequest). El bloqueo
// se ejerce en el servicio, no solo en el DTO, así que es verificable a este
// nivel aunque el ValidationPipe no intervenga.
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

  it('rechaza cambiar un DPI ya establecido y no persiste NADA del payload', async () => {
    const user = await createUser(ds, {
      dpi: '1234567890101',
      phone: '88887777',
      fullName: 'Nombre Original',
    });

    await expect(
      service.updateProfile(user.id, {
        dpi: '9999999999999',
        fullName: 'Nombre Editado',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    const updated = await ds.getRepository(User).findOne({
      where: { id: user.id },
      select: ['id', 'fullName', 'dpi', 'phone'],
    });
    expect(updated?.dpi).toBe('1234567890101'); // DPI intacto
    expect(updated?.fullName).toBe('Nombre Original'); // el throw corta el save
  });

  it('establece el DPI UNA vez si estaba vacío; después queda inmutable', async () => {
    const user = await createUserWithoutDpi(ds); // sin dpi

    await service.updateProfile(user.id, { dpi: '1234567890101' } as any);

    const updated = await ds.getRepository(User).findOne({
      where: { id: user.id },
      select: ['id', 'dpi'],
    });
    expect(updated?.dpi).toBe('1234567890101');

    // Segundo intento (aunque sea el mismo valor) → rechazado.
    await expect(
      service.updateProfile(user.id, { dpi: '1234567890101' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rechaza un DPI que ya pertenece a otro usuario (unique)', async () => {
    await createUser(ds, { dpi: '1234567890101' });
    const user = await createUserWithoutDpi(ds); // sin dpi

    await expect(
      service.updateProfile(user.id, { dpi: '1234567890101' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
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
