import { TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { PaymentsService } from '../src/modules/payments/payments.service';
import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationLog } from '../src/modules/reservations/entities/reservation-log.entity';
import { UpdateReservationStatusDto } from '../src/modules/reservations/dto/update-reservation-status.dto';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
import { Role } from '../src/common/enums/role.enum';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createSede,
  createCourtResource,
  createReservation,
  createPayment,
  asAuthUser,
} from './utils/fixtures';

const statusDto = (status: ReservationStatus): UpdateReservationStatusDto =>
  ({ status }) as UpdateReservationStatusDto;

// ADM-1 Fase 2 — Alcance multi-sede. Un operador acotado a la sede A NO debe
// ver ni gestionar reservas/pagos de la sede B; el super-admin las ve todas.
// Prueba el filtrado (findAll) y la autorización por-id (findOne, updateStatus,
// getPaymentByReservation), más el camino positivo same-sede.
describe('Alcance por sede (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let reservations: ReservationsService;
  let payments: PaymentsService;
  let ds: DataSource;

  beforeAll(async () => {
    moduleRef = await createTestModule();
    reservations = moduleRef.get(ReservationsService);
    payments = moduleRef.get(PaymentsService);
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ds);
  });

  // Arma dos sedes con una reserva (UNDER_REVIEW) cada una y un operador de la
  // sede A.
  async function setupTwoSedes() {
    const sedeA = await createSede(ds);
    const sedeB = await createSede(ds);
    const courtA = await createCourtResource(ds, { sedeId: sedeA.id });
    const courtB = await createCourtResource(ds, { sedeId: sedeB.id });
    const citizen = await createUser(ds);

    const rA = await createReservation(ds, {
      userId: citizen.id,
      resourceId: courtA.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.UNDER_REVIEW,
    });
    const rB = await createReservation(ds, {
      userId: citizen.id,
      resourceId: courtB.id,
      reservationDate: '2099-01-02',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.UNDER_REVIEW,
    });

    const operatorA = await createUser(ds, { role: Role.OPERATOR });
    const authA = asAuthUser(operatorA, { sedeIds: [sedeA.id] });

    return { sedeA, sedeB, rA, rB, operatorA, authA };
  }

  it('findAll: el operador de la sede A solo ve las reservas de su sede', async () => {
    const { rA, authA } = await setupTwoSedes();

    const result = await reservations.findAll(authA);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe(rA.id);
    expect(result.meta.total).toBe(1);
  });

  it('findAll: un admin/operador SIN sedes asignadas no ve nada (fail-closed)', async () => {
    await setupTwoSedes();
    const lonely = await createUser(ds, { role: Role.OPERATOR });

    const result = await reservations.findAll(asAuthUser(lonely, { sedeIds: [] }));

    expect(result.data).toHaveLength(0);
    expect(result.meta.total).toBe(0);
  });

  it('findOne: acceder a una reserva de otra sede lanza Forbidden', async () => {
    const { rB, authA } = await setupTwoSedes();

    await expect(reservations.findOne(rB.id, authA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('findOne: acceder a una reserva de su propia sede funciona', async () => {
    const { rA, authA } = await setupTwoSedes();

    const found = await reservations.findOne(rA.id, authA);
    expect(found.id).toBe(rA.id);
  });

  it('updateStatus: gestionar una reserva de otra sede lanza Forbidden y no cambia nada', async () => {
    const { rB, authA } = await setupTwoSedes();

    await expect(
      reservations.updateStatus(rB.id, statusDto(ReservationStatus.REJECTED), authA),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // rB intacta y sin log.
    const updated = await ds.getRepository(Reservation).findOneBy({ id: rB.id });
    expect(updated?.status).toBe(ReservationStatus.UNDER_REVIEW);
    const logs = await ds
      .getRepository(ReservationLog)
      .countBy({ reservationId: rB.id });
    expect(logs).toBe(0);
  });

  it('updateStatus: gestionar una reserva de su propia sede funciona (con pago)', async () => {
    const { rA, authA } = await setupTwoSedes();
    await createPayment(ds, rA.id);

    const result = await reservations.updateStatus(
      rA.id,
      statusDto(ReservationStatus.APPROVED),
      authA,
    );
    expect(result?.status).toBe(ReservationStatus.APPROVED);
  });

  it('getPaymentByReservation: ver el pago de otra sede lanza Forbidden', async () => {
    const { rB, authA } = await setupTwoSedes();
    await createPayment(ds, rB.id);

    await expect(
      payments.getPaymentByReservation(rB.id, authA),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('super-admin: ve las reservas de todas las sedes', async () => {
    const { rA, rB } = await setupTwoSedes();
    const boss = await createUser(ds, { role: Role.ADMIN, isSuperAdmin: true });

    const result = await reservations.findAll(
      asAuthUser(boss, { isSuperAdmin: true }),
    );

    expect(result.data).toHaveLength(2);
    const ids = result.data.map((r) => r.id).sort();
    expect(ids).toEqual([rA.id, rB.id].sort());
  });
});
