import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';

import { UsersService, DpiFiles } from '../src/modules/users/users.service';
import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { User } from '../src/modules/users/entities/user.entity';
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
  createUserWithoutDpi,
  createCourtResource,
  createSchedule,
  asAuthUser,
} from './utils/fixtures';

// Los archivos se escriben bajo UPLOAD_PATH/dpi (como haría Multer en prod):
// getDpiFile tiene guard anti path-traversal contra UPLOAD_PATH.
const dpiDir = join(process.env.UPLOAD_PATH || './uploads', 'dpi');

async function fakeDpiPhoto(name: string): Promise<Express.Multer.File> {
  await fs.mkdir(dpiDir, { recursive: true });
  const path = join(
    dpiDir,
    `test-${name}-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`,
  );
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
  ]);
  await fs.writeFile(path, png);
  return {
    path,
    originalname: `${name}.png`,
    size: png.length,
  } as Express.Multer.File;
}

async function fakeDpiFiles(): Promise<DpiFiles> {
  return {
    dpiFront: [await fakeDpiPhoto('front')],
    dpiBack: [await fakeDpiPhoto('back')],
  };
}

const fileExists = (path: string) =>
  fs.access(path).then(
    () => true,
    () => false,
  );

// CR-1 — DPI con fotos (frente y reverso): subida desde el perfil, número con
// regla USR-1 (inmutable), re-subida reemplaza y limpia, y el gate en create():
// sin DPI completo no se reserva.
describe('CR-1 — DPI con fotos (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let service: UsersService;
  let reservations: ReservationsService;
  let ds: DataSource;
  const tempFiles: string[] = [];

  function track(files: DpiFiles): DpiFiles {
    if (files.dpiFront?.[0]) tempFiles.push(files.dpiFront[0].path);
    if (files.dpiBack?.[0]) tempFiles.push(files.dpiBack[0].path);
    return files;
  }

  beforeAll(async () => {
    moduleRef = await createTestModule();
    service = moduleRef.get(UsersService);
    reservations = moduleRef.get(ReservationsService);
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await Promise.all(
      tempFiles.map((f) => fs.unlink(f).catch(() => undefined)),
    );
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ds);
  });

  it('sube número + 2 fotos; una re-subida reemplaza las fotos y borra las viejas', async () => {
    const user = await createUserWithoutDpi(ds);

    const first = track(await fakeDpiFiles());
    const result = await service.uploadDpi(user.id, first, {
      dpi: '2997184520101',
    });
    expect(result.dpi).toBe('2997184520101');

    const saved = await ds.getRepository(User).findOneByOrFail({ id: user.id });
    expect(saved.dpi).toBe('2997184520101');
    expect(saved.dpiFrontPath).toBe(first.dpiFront![0].path);
    expect(saved.dpiBackPath).toBe(first.dpiBack![0].path);
    expect(await fileExists(saved.dpiFrontPath!)).toBe(true);

    // Re-subida (sin número: ya está fijado): reemplaza y limpia las viejas.
    const second = track(await fakeDpiFiles());
    await service.uploadDpi(user.id, second, {});

    const updated = await ds
      .getRepository(User)
      .findOneByOrFail({ id: user.id });
    expect(updated.dpiFrontPath).toBe(second.dpiFront![0].path);
    expect(await fileExists(first.dpiFront![0].path)).toBe(false); // vieja fuera
    expect(await fileExists(first.dpiBack![0].path)).toBe(false);
  });

  it('falta una de las dos fotos → BadRequest y borra la que sí llegó', async () => {
    const user = await createUserWithoutDpi(ds);
    const files = track(await fakeDpiFiles());
    const soloFrente: DpiFiles = { dpiFront: files.dpiFront };

    await expect(
      service.uploadDpi(user.id, soloFrente, { dpi: '2997184520101' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await fileExists(files.dpiFront![0].path)).toBe(false);
  });

  it('número ya fijado: mandar dpi (aunque sea el mismo) → BadRequest y limpieza (USR-1)', async () => {
    const user = await createUser(ds, { dpi: '2997184520101' });
    const files = track(await fakeDpiFiles());

    await expect(
      service.uploadDpi(user.id, files, { dpi: '2997184520101' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await fileExists(files.dpiFront![0].path)).toBe(false);
    expect(await fileExists(files.dpiBack![0].path)).toBe(false);
  });

  it('sin número previo y sin dpi en el payload → BadRequest y limpieza', async () => {
    const user = await createUserWithoutDpi(ds);
    const files = track(await fakeDpiFiles());

    await expect(service.uploadDpi(user.id, files, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(await fileExists(files.dpiFront![0].path)).toBe(false);
  });

  it('archivo que no es imagen real (magic bytes) → BadRequest y limpieza', async () => {
    const user = await createUserWithoutDpi(ds);
    const files = track(await fakeDpiFiles());
    // Pisar el "frente" con contenido que no es PNG/JPG.
    await fs.writeFile(files.dpiFront![0].path, Buffer.from('no soy imagen'));

    await expect(
      service.uploadDpi(user.id, files, { dpi: '2997184520101' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(await fileExists(files.dpiBack![0].path)).toBe(false);
  });

  it('gate en create(): sin DPI completo no se reserva; con DPI sí', async () => {
    const sinDpi = await createUserWithoutDpi(ds);
    const conDpi = await createUser(ds); // fixture: DPI completo
    const court = await createCourtResource(ds);
    const reservationDate = addDaysToISODate(guatemalaNow().date, 2);
    await createSchedule(ds, court.id, dayOfWeekFromISODate(reservationDate));

    const dto = {
      resourceId: court.id,
      reservationDate,
      startTime: '10:00',
      endTime: '11:00',
      contactName: 'Encargado Test',
      contactPhone: '55556666',
    };

    await expect(reservations.create(sinDpi.id, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    const saved = await reservations.create(conDpi.id, dto);
    expect(saved.id).toBeDefined();
  });

  it('getDpiFile: el dueño y el admin ven la foto; otro ciudadano recibe Forbidden', async () => {
    const owner = await createUserWithoutDpi(ds);
    const files = track(await fakeDpiFiles());
    await service.uploadDpi(owner.id, files, { dpi: '2997184520101' });

    const otherCitizen = await createUser(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });

    // Dueño.
    const own = await service.getDpiFile(owner.id, 'front', asAuthUser(owner));
    expect(own.contentType).toBe('image/png');

    // Admin (verificación de vecindad).
    const byAdmin = await service.getDpiFile(
      owner.id,
      'back',
      asAuthUser(admin),
    );
    // El servicio devuelve la ruta ABSOLUTA (resolve, guard anti-traversal).
    expect(byAdmin.path).toBe(resolve(files.dpiBack![0].path));

    // Otro ciudadano, jamás.
    await expect(
      service.getDpiFile(owner.id, 'front', asAuthUser(otherCitizen)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
