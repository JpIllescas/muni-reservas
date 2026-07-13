import { BadRequestException } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../src/modules/reservations/entities/reservation-log.entity';
import { Payment } from '../src/modules/payments/entities/payment.entity';
import { UpdateReservationStatusDto } from '../src/modules/reservations/dto/update-reservation-status.dto';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
import { PaymentMethod } from '../src/common/enums/payment-method.enum';
import { PaymentStatus } from '../src/common/enums/payment-status.enum';
import { Role } from '../src/common/enums/role.enum';
import {
  guatemalaNow,
  addDaysToISODate,
  dayOfWeekFromISODate,
} from '../src/common/utils/date.utils';

import { createTestModule, notificationsMock } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createCourtResource,
  createRanchResource,
  createReservation,
  createSchedule,
  asAuthUser,
} from './utils/fixtures';

const statusDto = (
  status: ReservationStatus,
  extra: Partial<UpdateReservationStatusDto> = {},
): UpdateReservationStatusDto =>
  ({ status, ...extra }) as UpdateReservationStatusDto;

// FLO-1 — Recurso de confirmación por llamada (requiresVoucher=false): el admin
// aprueba directo desde pending_payment sin boleta subida, y la reserva no
// auto-expira. CR-7: esa aprobación ahora EXIGE el número de la boleta física
// (pago en efectivo al llegar) y deja un Payment cash aprobado como constancia.
// La cara de denegación (recurso que SÍ exige boleta) la cubren los tests de
// reservations-update-status (usan cancha con requiresVoucher=true por defecto).
describe('FLO-1 — recurso sin comprobante (e2e, BD real)', () => {
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

  it('updateStatus: aprueba pending_payment → approved con número de boleta y crea el Payment cash (CR-7)', async () => {
    const admin = await createUser(ds, {
      role: Role.ADMIN,
      isSuperAdmin: true,
    });
    const citizen = await createUser(ds);
    const ranch = await createRanchResource(ds, { requiresVoucher: false });
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: ranch.id,
      reservationDate: '2099-01-01',
      status: ReservationStatus.PENDING_PAYMENT,
    });

    const result = await service.updateStatus(
      r.id,
      statusDto(ReservationStatus.APPROVED, { receiptNumber: 'B-0451-2026' }),
      asAuthUser(admin, { isSuperAdmin: true }),
    );
    expect(result?.status).toBe(ReservationStatus.APPROVED);

    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.APPROVED);
    expect(updated?.confirmedAt).not.toBeNull();

    const logs = await ds
      .getRepository(ReservationLog)
      .find({ where: { reservationId: r.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].toStatus).toBe(ReservationStatus.APPROVED);

    // CR-7: la aprobación dejó constancia del pago en efectivo.
    const payments = await ds
      .getRepository(Payment)
      .find({ where: { reservationId: r.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].method).toBe(PaymentMethod.CASH);
    expect(payments[0].status).toBe(PaymentStatus.APPROVED);
    expect(payments[0].transactionReference).toBe('B-0451-2026');
    expect(payments[0].reviewedById).toBe(admin.id);
  });

  it('updateStatus: rechaza aprobar SIN número de boleta y no cambia nada (CR-7)', async () => {
    const admin = await createUser(ds, {
      role: Role.ADMIN,
      isSuperAdmin: true,
    });
    const citizen = await createUser(ds);
    const ranch = await createRanchResource(ds, { requiresVoucher: false });
    const r = await createReservation(ds, {
      userId: citizen.id,
      resourceId: ranch.id,
      reservationDate: '2099-01-01',
      status: ReservationStatus.PENDING_PAYMENT,
    });

    await expect(
      service.updateStatus(
        r.id,
        statusDto(ReservationStatus.APPROVED),
        asAuthUser(admin, { isSuperAdmin: true }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // Rollback total: ni estado, ni pago, ni log.
    const updated = await ds.getRepository(Reservation).findOneBy({ id: r.id });
    expect(updated?.status).toBe(ReservationStatus.PENDING_PAYMENT);

    const payments = await ds
      .getRepository(Payment)
      .find({ where: { reservationId: r.id } });
    expect(payments).toHaveLength(0);

    const logs = await ds
      .getRepository(ReservationLog)
      .find({ where: { reservationId: r.id } });
    expect(logs).toHaveLength(0);
  });

  it('create: un recurso sin comprobante no recibe paymentDeadline (no auto-expira)', async () => {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds, { requiresVoucher: false });
    const reservationDate = addDaysToISODate(guatemalaNow().date, 2);
    const dayOfWeek = dayOfWeekFromISODate(reservationDate);
    await createSchedule(ds, court.id, dayOfWeek, {
      openTime: '08:00',
      closeTime: '20:00',
    });

    const saved = await service.create(citizen.id, {
      resourceId: court.id,
      reservationDate,
      startTime: '10:00',
      endTime: '11:00',
      contactName: 'Encargado Test',
      contactPhone: '55556666',
    });

    expect(saved.paymentDeadline).toBeNull();

    // CR-2: una reserva sin boleta nace "por autorizar" → dispara el aviso a
    // los admins de la sede (la lógica interna se prueba en notifications-cr2).
    expect(
      notificationsMock.notifyReservationPendingReview,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: saved.id }),
      expect.objectContaining({ id: court.id }),
    );
  });
});
