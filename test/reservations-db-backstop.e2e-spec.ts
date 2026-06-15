import { TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';

import { Reservation } from '../src/modules/reservations/entities/reservation.entity';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';

import { createTestModule } from './utils/test-module';
import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createCourtResource,
  createRanchResource,
  createReservation,
} from './utils/fixtures';

// Test #3 — BACKSTOP A NIVEL BD.
//
// Aquí saltamos ReservationsService.create() (con toda su validación previa) e
// insertamos filas DIRECTAMENTE. El objetivo es probar que, incluso si la lógica
// de aplicación fallara, la BD por sí sola rechaza el doble booking:
//   - Canchas: exclusion constraint excl_court_overlap → SQLSTATE 23P01.
//   - Ranchos: índice único parcial uq_ranch_active_booking → SQLSTATE 23505.
//
// Para el constraint basta UN solo usuario: la restricción es por recurso + rango
// (canchas) o por recurso + fecha (ranchos); el usuario es irrelevante.

// El code del driver puede venir como `err.code` o `err.driverError.code` según
// la versión de TypeORM/pg; cubrimos ambas formas.
function sqlState(err: unknown): string | undefined {
  const e = err as { code?: string; driverError?: { code?: string } };
  return e?.code ?? e?.driverError?.code;
}

describe('Backstop de BD contra doble booking (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let ds: DataSource;

  beforeAll(async () => {
    moduleRef = await createTestModule();
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ds);
  });

  it('CANCHA: dos reservas activas con horarios solapados → 23P01 (excl_court_overlap)', async () => {
    const user = await createUser(ds);
    const court = await createCourtResource(ds);

    // Primera reserva 10:00–11:00: válida, se inserta sin problema.
    await createReservation(ds, {
      userId: user.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.PENDING_PAYMENT,
    });

    // Segunda 10:30–11:30: SOLAPA con la primera → la BD debe rechazarla.
    let captured: unknown;
    try {
      await createReservation(ds, {
        userId: user.id,
        resourceId: court.id,
        reservationDate: '2099-01-01',
        startTime: '10:30',
        endTime: '11:30',
        status: ReservationStatus.PENDING_PAYMENT,
      });
    } catch (err) {
      captured = err;
    }

    expect(captured).toBeDefined();
    expect(sqlState(captured)).toBe('23P01');

    // Solo la primera sobrevive.
    const count = await ds
      .getRepository(Reservation)
      .countBy({ resourceId: court.id });
    expect(count).toBe(1);
  });

  it('CANCHA: horarios adyacentes (11:00 vs 11:00) NO chocan — fin exclusivo', async () => {
    const user = await createUser(ds);
    const court = await createCourtResource(ds);

    await createReservation(ds, {
      userId: user.id,
      resourceId: court.id,
      reservationDate: '2099-01-01',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.PENDING_PAYMENT,
    });

    // 11:00–12:00 arranca justo cuando la otra termina: el rango es [inicio, fin)
    // así que NO se solapa y debe aceptarse.
    await expect(
      createReservation(ds, {
        userId: user.id,
        resourceId: court.id,
        reservationDate: '2099-01-01',
        startTime: '11:00',
        endTime: '12:00',
        status: ReservationStatus.PENDING_PAYMENT,
      }),
    ).resolves.toBeDefined();

    const count = await ds
      .getRepository(Reservation)
      .countBy({ resourceId: court.id });
    expect(count).toBe(2);
  });

  it('RANCHO: dos reservas activas el mismo día → 23505 (uq_ranch_active_booking)', async () => {
    const user = await createUser(ds);
    const ranch = await createRanchResource(ds);

    // Rancho = día completo (start/end null, como deja el fixture por defecto).
    await createReservation(ds, {
      userId: user.id,
      resourceId: ranch.id,
      reservationDate: '2099-01-01',
      status: ReservationStatus.PENDING_PAYMENT,
    });

    let captured: unknown;
    try {
      await createReservation(ds, {
        userId: user.id,
        resourceId: ranch.id,
        reservationDate: '2099-01-01',
        status: ReservationStatus.PENDING_PAYMENT,
      });
    } catch (err) {
      captured = err;
    }

    expect(captured).toBeDefined();
    expect(sqlState(captured)).toBe('23505');

    const count = await ds
      .getRepository(Reservation)
      .countBy({ resourceId: ranch.id });
    expect(count).toBe(1);
  });
});
