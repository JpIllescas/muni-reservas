import { BadRequestException } from '@nestjs/common';
import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../src/modules/reservations/entities/reservation-log.entity';
import { UpdateReservationStatusDto } from '../src/modules/reservations/dto/update-reservation-status.dto';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
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
  createSchedule,
  asAuthUser,
} from './utils/fixtures';

const statusDto = (
  status: ReservationStatus,
  extra: Partial<UpdateReservationStatusDto> = {},
): UpdateReservationStatusDto =>
  ({ status, ...extra }) as UpdateReservationStatusDto;

// CR-4 — Confirmación previa a la boleta (solo canchas CON boleta): la reserva
// nace "pendiente de aceptar" SIN ventana de pago; el admin acepta (1ª
// confirmación) → pending_payment con ventana FRESCA; luego el flujo normal
// (boleta → revisión → aprobar/rechazar). No auto-expira mientras espera.
describe('CR-4 — confirmación previa (e2e, BD real)', () => {
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

  // Cancha CON boleta (el caso La Pólvora) + su horario del día.
  async function newCourtReservation() {
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds); // requiresVoucher=true default
    const reservationDate = addDaysToISODate(guatemalaNow().date, 2);
    await createSchedule(ds, court.id, dayOfWeekFromISODate(reservationDate));

    const saved = await service.create(citizen.id, {
      resourceId: court.id,
      reservationDate,
      startTime: '10:00',
      endTime: '11:00',
      contactName: 'Encargado Test',
      contactPhone: '55556666',
    });
    return { citizen, court, saved, reservationDate };
  }

  it('cancha con boleta nace PENDIENTE DE ACEPTAR, sin ventana de pago, y avisa a los admins', async () => {
    const { court, saved } = await newCourtReservation();

    expect(saved.status).toBe(ReservationStatus.PENDING_CONFIRMATION);
    expect(saved.paymentDeadline).toBeNull();

    const logs = await ds
      .getRepository(ReservationLog)
      .find({ where: { reservationId: saved.id } });
    expect(logs).toHaveLength(1);
    expect(logs[0].toStatus).toBe(ReservationStatus.PENDING_CONFIRMATION);

    // CR-2: nace necesitando acción del admin → aviso.
    expect(
      notificationsMock.notifyReservationPendingReview,
    ).toHaveBeenCalledWith(
      expect.objectContaining({ id: saved.id }),
      expect.objectContaining({ id: court.id }),
    );
  });

  it('aceptar (1ª confirmación) → pending_payment con ventana de pago FRESCA y correo al ciudadano', async () => {
    const { saved } = await newCourtReservation();
    const before = Date.now();

    const result = await service.updateStatus(
      saved.id,
      statusDto(ReservationStatus.PENDING_PAYMENT),
      await adminAuth(),
    );

    expect(result?.status).toBe(ReservationStatus.PENDING_PAYMENT);
    // Ventana fresca: arranca al aceptar (24h default), no al crear.
    const deadline = new Date(result!.paymentDeadline!).getTime();
    expect(deadline).toBeGreaterThan(before);
    expect(deadline).toBeLessThanOrEqual(before + 25 * 60 * 60 * 1000);

    // El ciudadano se entera del cambio (correo de estado ya existente).
    expect(notificationsMock.sendReservationStatusEmail).toHaveBeenCalledWith(
      expect.objectContaining({ id: saved.userId }),
      expect.objectContaining({ id: saved.id }),
      ReservationStatus.PENDING_PAYMENT,
      undefined,
    );
  });

  it('anular desde pendiente de aceptar → rejected con motivo', async () => {
    const { saved } = await newCourtReservation();

    const result = await service.updateStatus(
      saved.id,
      statusDto(ReservationStatus.REJECTED, { reason: 'Cancha en uso' }),
      await adminAuth(),
    );

    expect(result?.status).toBe(ReservationStatus.REJECTED);
    expect(result?.rejectionReason).toBe('Cancha en uso');
  });

  it('aprobar directo desde pendiente de aceptar → BadRequest (debe pasar por el flujo de pago)', async () => {
    const { saved } = await newCourtReservation();

    await expect(
      service.updateStatus(
        saved.id,
        statusDto(ReservationStatus.APPROVED),
        await adminAuth(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el slot queda BLOQUEADO mientras espera la primera confirmación', async () => {
    const { court, reservationDate } = await newCourtReservation();
    const otherCitizen = await createUser(ds);

    await expect(
      service.create(otherCitizen.id, {
        resourceId: court.id,
        reservationDate,
        startTime: '10:00',
        endTime: '11:00',
        contactName: 'Otro Encargado',
        contactPhone: '44443333',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('el cron NO expira una reserva pendiente de aceptar (no auto-expira)', async () => {
    const { saved } = await newCourtReservation();

    await service.expireOverdueReservations();

    const intact = await ds
      .getRepository(Reservation)
      .findOneByOrFail({ id: saved.id });
    expect(intact.status).toBe(ReservationStatus.PENDING_CONFIRMATION);
  });

  it('el ciudadano puede cancelar mientras está pendiente de aceptar', async () => {
    const { citizen, saved } = await newCourtReservation();

    await service.cancel(saved.id, citizen.id);

    const cancelled = await ds
      .getRepository(Reservation)
      .findOneByOrFail({ id: saved.id });
    expect(cancelled.status).toBe(ReservationStatus.CANCELLED);
  });
});
