import { DataSource } from 'typeorm';
import { User } from '../../src/modules/users/entities/user.entity';
import { Resource } from '../../src/modules/resources/entities/resource.entity';
import { Sede } from '../../src/modules/resources/entities/sede.entity';
import type { AuthUser } from '../../src/common/interfaces/auth-user.interface';
import { ResourceSchedule } from '../../src/modules/resources/entities/resource-schedule.entity';
import { Reservation } from '../../src/modules/reservations/entities/reservation.entity';
import { Payment } from '../../src/modules/payments/entities/payment.entity';
import { Role } from '../../src/common/enums/role.enum';
import { ResourceType } from '../../src/common/enums/resource-type.enum';
import { ReservationStatus } from '../../src/common/enums/reservation-status.enum';

let seq = 0;

// Usuario mínimo válido. La password es un hash ficticio (los tests no hacen
// login; solo necesitamos la FK).
export async function createUser(
  ds: DataSource,
  overrides: Partial<User> = {},
): Promise<User> {
  seq += 1;
  const repo = ds.getRepository(User);
  const user = repo.create({
    fullName: `Test User ${seq}`,
    email: `test.user.${seq}.${Date.now()}@example.com`,
    password: 'no-usado-en-tests',
    isEmailVerified: true,
    isActive: true,
    role: Role.CITIZEN,
    ...overrides,
  });
  return repo.save(user);
}

// Construye el AuthUser que los controladores inyectarían (ADM-1): lo que el
// servicio consume para acotar por sede. Por defecto sin sedes y sin flag.
export function asAuthUser(
  user: User,
  overrides: Partial<AuthUser> = {},
): AuthUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    isSuperAdmin: user.isSuperAdmin ?? false,
    sedeIds: [],
    ...overrides,
  };
}

// Sede mínima válida (ADM-1).
export async function createSede(
  ds: DataSource,
  overrides: Partial<Sede> = {},
): Promise<Sede> {
  seq += 1;
  const repo = ds.getRepository(Sede);
  const sede = repo.create({
    name: `Sede ${seq}.${Date.now()}`,
    isActive: true,
    ...overrides,
  });
  return repo.save(sede);
}

export async function createCourtResource(
  ds: DataSource,
  overrides: Partial<Resource> = {},
): Promise<Resource> {
  seq += 1;
  const repo = ds.getRepository(Resource);
  // sede_id es NOT NULL (ADM-1): si el test no fija una sede, se crea una.
  const sedeId = overrides.sedeId ?? (await createSede(ds)).id;
  const resource = repo.create({
    name: `Cancha ${seq}`,
    type: ResourceType.COURT,
    pricePerUnit: 50,
    advanceDays: 7,
    isActive: true,
    sedeId,
    ...overrides,
  });
  return repo.save(resource);
}

export async function createRanchResource(
  ds: DataSource,
  overrides: Partial<Resource> = {},
): Promise<Resource> {
  seq += 1;
  const repo = ds.getRepository(Resource);
  // sede_id es NOT NULL (ADM-1): si el test no fija una sede, se crea una.
  const sedeId = overrides.sedeId ?? (await createSede(ds)).id;
  const resource = repo.create({
    name: `Rancho ${seq}`,
    type: ResourceType.RANCH,
    pricePerUnit: 300,
    advanceDays: 30,
    isActive: true,
    sedeId,
    ...overrides,
  });
  return repo.save(resource);
}

// Horario activo para un día de la semana (0=domingo..6=sábado).
export async function createSchedule(
  ds: DataSource,
  resourceId: string,
  dayOfWeek: number,
  overrides: Partial<ResourceSchedule> = {},
): Promise<ResourceSchedule> {
  const repo = ds.getRepository(ResourceSchedule);
  const schedule = repo.create({
    resourceId,
    dayOfWeek,
    openTime: '08:00',
    closeTime: '20:00',
    slotDurationMin: 60,
    isActive: true,
    ...overrides,
  });
  return repo.save(schedule);
}

// Inserta una reserva DIRECTAMENTE (salta ReservationsService.create), útil para
// preparar el estado inicial de los tests de cron / updateStatus.
export async function createReservation(
  ds: DataSource,
  data: Partial<Reservation> & { userId: string; resourceId: string; reservationDate: string },
): Promise<Reservation> {
  const repo = ds.getRepository(Reservation);
  const reservation = repo.create({
    status: ReservationStatus.PENDING_PAYMENT,
    startTime: null,
    endTime: null,
    paymentDeadline: null,
    // total_amount es NOT NULL (ARQ-1). Estos tests no asertan sobre el monto
    // (validan estados/locks/constraints), así que 0 basta; se puede override.
    totalAmount: 0,
    ...data,
  });
  return repo.save(reservation);
}

export async function createPayment(
  ds: DataSource,
  reservationId: string,
  overrides: Partial<Payment> = {},
): Promise<Payment> {
  const repo = ds.getRepository(Payment);
  const payment = repo.create({
    reservationId,
    ...overrides,
  });
  return repo.save(payment);
}
