import { TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
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

// CR-3 — El admin fija el PRECIO FINAL de una reserva puntual (carta/acuerdo).
// Se apoya en las columnas de FLO-2: discountAmount = original − nuevo precio
// (negativo si sube), así el original nunca se pierde y setPrice/applyDiscount
// son consistentes entre sí. Misma ventana que el descuento (antes de aprobar).
describe('reservation set price — CR-3 (e2e, BD real)', () => {
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

  // Rancho de Q300 con reserva pendiente de pago (mismo escenario que FLO-2).
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

  it('baja el precio: totalAmount queda como el nuevo monto y el ajuste registra quién/por qué', async () => {
    const r = await pendingReservation();
    const admin = await adminAuth();

    const updated = await service.setPrice(
      r.id,
      { newTotal: 250, reason: 'Carta municipal 123-2026' },
      admin,
    );

    expect(updated.totalAmount).toBe(250);
    expect(updated.discountAmount).toBe(50); // original 300 − nuevo 250
    expect(updated.discountReason).toBe('Carta municipal 123-2026');
    expect(updated.discountAppliedBy).toBe(admin.id);

    const audits = await ds
      .getRepository(AuditLog)
      .find({ where: { entityId: r.id } });
    expect(audits).toHaveLength(1);
    expect(audits[0].action).toBe('SET_PRICE');
  });

  it('sube el precio: el ajuste queda NEGATIVO y el original se reconstruye igual', async () => {
    const r = await pendingReservation();

    const updated = await service.setPrice(
      r.id,
      { newTotal: 350, reason: 'Tarifa de no vecino' },
      await adminAuth(),
    );

    expect(updated.totalAmount).toBe(350);
    expect(updated.discountAmount).toBe(-50); // original 300 − nuevo 350
  });

  it('re-fijar parte SIEMPRE del original (no se encadena sobre el ajuste previo)', async () => {
    const r = await pendingReservation();
    await service.setPrice(
      r.id,
      { newTotal: 250, reason: 'Carta' },
      await adminAuth(),
    );

    const updated = await service.setPrice(
      r.id,
      { newTotal: 200, reason: 'Carta corregida' },
      await adminAuth(),
    );

    expect(updated.totalAmount).toBe(200);
    expect(updated.discountAmount).toBe(100); // 300 − 200, no 250 − 200
  });

  it('fijar el precio original quita el ajuste vigente', async () => {
    const r = await pendingReservation();
    await service.setPrice(
      r.id,
      { newTotal: 250, reason: 'Carta' },
      await adminAuth(),
    );

    const updated = await service.setPrice(
      r.id,
      { newTotal: 300, reason: 'Se anuló la carta' },
      await adminAuth(),
    );

    expect(updated.totalAmount).toBe(300);
    expect(updated.discountAmount).toBeNull();
    expect(updated.discountReason).toBeNull();
    expect(updated.discountAppliedBy).toBeNull();
    expect(updated.discountAppliedAt).toBeNull();
  });

  it('fijar el precio que ya tiene (sin ajuste vigente) → BadRequest', async () => {
    const r = await pendingReservation();

    await expect(
      service.setPrice(
        r.id,
        { newTotal: 300, reason: 'Sin cambio' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('setPrice y applyDiscount son consistentes: el descuento recalcula desde el MISMO original', async () => {
    const r = await pendingReservation();
    await service.setPrice(
      r.id,
      { newTotal: 250, reason: 'Carta' },
      await adminAuth(),
    );

    // FLO-2 sobre la misma reserva: reconstruye original = 250 + 50 = 300.
    const updated = await service.applyDiscount(
      r.id,
      { amount: 100, reason: 'Carta mayor' },
      await adminAuth(),
    );

    expect(updated.totalAmount).toBe(200); // 300 − 100
    expect(updated.discountAmount).toBe(100);
  });

  it('con la reserva ya aprobada el precio está congelado → BadRequest', async () => {
    const r = await pendingReservation(ReservationStatus.APPROVED);

    await expect(
      service.setPrice(
        r.id,
        { newTotal: 250, reason: 'Carta' },
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    const intact = await ds
      .getRepository(Reservation)
      .findOneByOrFail({ id: r.id });
    expect(intact.totalAmount).toBe(300);
  });

  it('un admin sin acceso a la sede del recurso recibe Forbidden (ADM-1)', async () => {
    const r = await pendingReservation();
    const outsider = await createUser(ds, { role: Role.ADMIN });
    const outsiderAuth = asAuthUser(outsider, {
      isSuperAdmin: false,
      sedeIds: ['00000000-0000-0000-0000-000000000000'],
    });

    await expect(
      service.setPrice(r.id, { newTotal: 250, reason: 'Carta' }, outsiderAuth),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
