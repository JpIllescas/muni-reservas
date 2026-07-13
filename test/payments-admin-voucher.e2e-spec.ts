import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { PaymentsService } from '../src/modules/payments/payments.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../src/modules/reservations/entities/reservation-log.entity';
import { Payment } from '../src/modules/payments/entities/payment.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
import { PaymentMethod } from '../src/common/enums/payment-method.enum';
import { PaymentStatus } from '../src/common/enums/payment-status.enum';
import { Role } from '../src/common/enums/role.enum';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createSede,
  createCourtResource,
  createReservation,
  asAuthUser,
} from './utils/fixtures';

// Archivo real en disco con magic bytes de PNG: detectFileType lo lee del
// filesystem, así que un mock en memoria no sirve.
async function fakeVoucherFile(): Promise<Express.Multer.File> {
  const dir = join(tmpdir(), 'muni-reservas-e2e');
  await fs.mkdir(dir, { recursive: true });
  const path = join(
    dir,
    `boleta-${Date.now()}-${Math.round(Math.random() * 1e9)}.png`,
  );
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
  ]);
  await fs.writeFile(path, png);
  return {
    path,
    originalname: 'boleta.png',
    size: png.length,
  } as Express.Multer.File;
}

const fileExists = (path: string) =>
  fs.access(path).then(
    () => true,
    () => false,
  );

// CR-5 — El admin/operador registra un pago EN EFECTIVO hecho en la cancha,
// subiendo la boleta en nombre del ciudadano: Payment cash + under_review en
// una transacción, con gating de sede (ADM-1) y limpieza del archivo si falla.
describe('CR-5 — boleta cargada por admin, pago en efectivo (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let service: PaymentsService;
  let ds: DataSource;
  const tempFiles: string[] = [];

  beforeAll(async () => {
    moduleRef = await createTestModule();
    service = moduleRef.get(PaymentsService);
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

  it('registra el pago cash, pasa la reserva a under_review y audita', async () => {
    const sede = await createSede(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds, { sedeId: sede.id });
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.PENDING_PAYMENT,
    });

    const file = await fakeVoucherFile();
    tempFiles.push(file.path);

    const result = await service.uploadVoucherByAdmin(
      r.id,
      asAuthUser(admin, { sedeIds: [sede.id] }),
      file,
      { transactionReference: 'B-0777-2026', notes: 'Pagó en la cancha' },
    );
    expect(result.message).toContain('bajo revisión');

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.UNDER_REVIEW);

    const payments = await ds
      .getRepository(Payment)
      .find({ where: { reservationId: r.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].method).toBe(PaymentMethod.CASH);
    expect(payments[0].status).toBe(PaymentStatus.PENDING);
    expect(payments[0].transactionReference).toBe('B-0777-2026');
    expect(payments[0].voucherPath).toBe(file.path);

    const logs = await ds
      .getRepository(ReservationLog)
      .find({ where: { reservationId: r.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].changedById).toBe(admin.id);
    expect(logs[0].reason).toContain('B-0777-2026');

    const audits = await ds
      .getRepository(AuditLog)
      .find({ where: { entityId: r.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('ADMIN_UPLOAD_VOUCHER');

    // El archivo sigue en disco (es la boleta guardada).
    expect(await fileExists(file.path)).toBe(true);
  });

  it('sede ajena → Forbidden, nada cambia y el archivo se borra (ADM-1)', async () => {
    const sede = await createSede(ds);
    const otraSede = await createSede(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds, { sedeId: sede.id });
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.PENDING_PAYMENT,
    });

    const file = await fakeVoucherFile();
    tempFiles.push(file.path);

    await expect(
      service.uploadVoucherByAdmin(
        r.id,
        asAuthUser(admin, { sedeIds: [otraSede.id] }),
        file,
        { transactionReference: 'B-0001-2026' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.PENDING_PAYMENT);
    expect(
      await ds.getRepository(Payment).count({ where: { reservationId: r.id } }),
    ).toBe(0);
    expect(await fileExists(file.path)).toBe(false);
  });

  it('reserva que no está en pending_payment → BadRequest y el archivo se borra', async () => {
    const sede = await createSede(ds);
    const admin = await createUser(ds, { role: Role.ADMIN });
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds, { sedeId: sede.id });
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.APPROVED,
    });

    const file = await fakeVoucherFile();
    tempFiles.push(file.path);

    await expect(
      service.uploadVoucherByAdmin(
        r.id,
        asAuthUser(admin, { sedeIds: [sede.id] }),
        file,
        { transactionReference: 'B-0002-2026' },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(
      await ds.getRepository(Payment).count({ where: { reservationId: r.id } }),
    ).toBe(0);
    expect(await fileExists(file.path)).toBe(false);
  });
});
