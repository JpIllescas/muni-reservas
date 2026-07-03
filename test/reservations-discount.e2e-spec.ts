import { TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
import { Role } from '../src/common/enums/role.enum';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createRanchResource,
  createReservation,
  asAuthUser,
} from './utils/fixtures';

// FLO-2 — Descuento por carta/oferta (monto fijo en Q, solo ADMIN).
// totalAmount queda SIEMPRE como el monto FINAL a pagar (ARQ-1); el original se
// reconstruye como totalAmount + discountAmount, así que re-aplicar recalcula
// desde el original y amount=0 quita el descuento.
describe('reservation discount — FLO-2 (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let service: ReservationsService;
  let ds: DataSource;

  beforeAll(async () => {
    moduleRef = await createTestModule();
    service = moduleRef.get(ReservationsService);
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

  // Rancho de Q300 con reserva pendiente de pago (el caso Florencia que motiva FLO-2).
  async function pendingReservation(
    status = ReservationStatus.PENDING_PAYMENT,
  ) {
    const citizen = await createUser(ds);
    const ranch = await createRanchResource(ds, { requiresVoucher: false });
    return createReservation(ds, {
      userId: citizen.id,
      resourceId: ranch.id,
      reservationDate: '2099-01-05',
      totalAmount: 300,
      status,
    });
  }

  it('aplica un descuento: totalAmount queda como monto final y se registra quién/por qué', async () => {
    const r = await pendingReservation();
    const admin = await adminAuth();

    const updated = await service.applyDiscount(
      r.id,
      { amount: 50, reason: 'Carta municipal 123-2026' },
      admin,
    );

    expect(updated.totalAmount).toBe(250);
    expect(updated.discountAmount).toBe(50);
    expect(updated.discountReason).toBe('Carta municipal 123-2026');
    expect(updated.discountAppliedBy).toBe(admin.id);
    expect(updated.discountAppliedAt).toBeInstanceOf(Date);
  });

  it('re-aplicar recalcula desde el monto ORIGINAL (no descuenta sobre lo ya rebajado)', async () => {
    const r = await pendingReservation();

    await service.applyDiscount(
      r.id,
      { amount: 50, reason: 'Carta' },
      await adminAuth(),
    );
    const updated = await service.applyDiscount(
      r.id,
      { amount: 100, reason: 'Carta corregida' },
      await adminAuth(),
    );

    // 300 - 100 = 200 (y no 250 - 100 = 150).
    expect(updated.totalAmount).toBe(200);
    expect(updated.discountAmount).toBe(100);
  });

  it('amount=0 quita el descuento y restaura el monto original', async () => {
    const r = await pendingReservation();
    await service.applyDiscount(
      r.id,
      { amount: 50, reason: 'Carta' },
      await adminAuth(),
    );

    const updated = await service.applyDiscount(
      r.id,
      { amount: 0 },
      await adminAuth(),
    );

    expect(updated.totalAmount).toBe(300);
    expect(updated.discountAmount).toBeNull();
    expect(updated.discountReason).toBeNull();
    expect(updated.discountAppliedBy).toBeNull();
    expect(updated.discountAppliedAt).toBeNull();
  });

  it('amount=0 sin descuento vigente → BadRequest', async () => {
    const r = await pendingReservation();

    await expect(
      service.applyDiscount(r.id, { amount: 0 }, await adminAuth()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aplicar sin justificación → BadRequest', async () => {
    const r = await pendingReservation();

    await expect(
      service.applyDiscount(r.id, { amount: 50 }, await adminAuth()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('descuento mayor al monto original → BadRequest y nada cambia', async () => {
    const r = await pendingReservation();

    await expect(
      service.applyDiscount(
        r.id,
        { amount: 300.01, reason: 'Carta' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const intact = await ds
      .getRepository(Reservation)
      .findOneByOrFail({ id: r.id });
    expect(intact.totalAmount).toBe(300);
    expect(intact.discountAmount).toBeNull();
  });

  it('con la reserva ya aprobada el monto está congelado → BadRequest', async () => {
    const r = await pendingReservation(ReservationStatus.APPROVED);

    await expect(
      service.applyDiscount(
        r.id,
        { amount: 50, reason: 'Carta' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('un admin sin acceso a la sede del recurso recibe Forbidden (ADM-1)', async () => {
    const r = await pendingReservation();
    const outsider = await createUser(ds, { role: Role.ADMIN });
    const outsiderAuth = asAuthUser(outsider, {
      isSuperAdmin: false,
      sedeIds: ['00000000-0000-0000-0000-000000000000'],
    });

    await expect(
      service.applyDiscount(
        r.id,
        { amount: 50, reason: 'Carta' },
        outsiderAuth,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
