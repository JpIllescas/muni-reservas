import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { DataSource } from 'typeorm';

import { testDataSourceOptions } from './test-data-source';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { Notification } from '../src/modules/notifications/entities/notification.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { Resource } from '../src/modules/resources/entities/resource.entity';
import { ReservationStatus } from '../src/common/enums/reservation-status.enum';
import { Role } from '../src/common/enums/role.enum';

import { cleanDatabase } from './utils/db-clean';
import {
  createUser,
  createSede,
  createCourtResource,
  createReservation,
} from './utils/fixtures';

// CR-2 — Notificación a la administración cuando entra una reserva por
// autorizar: destinatarios correctos (admins/operadores de LA sede +
// super-admins, excluyendo al actor), filas en `notifications` y correo por
// cada uno. Aquí se usa el NotificationsService REAL con el mailer mockeado
// (en el resto de la suite es al revés: el servicio entero está mockeado).
describe('CR-2 — notificaciones a admins (e2e, BD real)', () => {
  let moduleRef: TestingModule;
  let service: NotificationsService;
  let ds: DataSource;
  const sendMail = jest.fn().mockResolvedValue(undefined);

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot(testDataSourceOptions),
        TypeOrmModule.forFeature([Notification, User]),
      ],
      providers: [
        NotificationsService,
        { provide: MailerService, useValue: { sendMail } },
      ],
    }).compile();

    service = moduleRef.get(NotificationsService);
    ds = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await cleanDatabase(ds);
    sendMail.mockClear();
  });

  // Vincula un admin/operador a una sede (M2M user_sedes).
  async function assignSede(userId: string, sedeId: string) {
    await ds.query(
      `INSERT INTO user_sedes (user_id, sede_id) VALUES ($1, $2)`,
      [userId, sedeId],
    );
  }

  async function pendingScenario() {
    const sede = await createSede(ds);
    const citizen = await createUser(ds);
    const court = await createCourtResource(ds, { sedeId: sede.id });
    const reservation = await createReservation(ds, {
      userId: citizen.id,
      resourceId: court.id,
      reservationDate: '2099-01-05',
      startTime: '10:00',
      endTime: '11:00',
      status: ReservationStatus.UNDER_REVIEW,
    });
    // Recargar con el tipo Resource completo para pasarlo al servicio.
    const resource = await ds
      .getRepository(Resource)
      .findOneByOrFail({ id: court.id });
    return { sede, reservation, resource };
  }

  it('notifica a admin/operador de LA sede y al super-admin; ignora otra sede, ciudadanos e inactivos', async () => {
    const { sede, reservation, resource } = await pendingScenario();
    const otraSede = await createSede(ds);

    const adminSede = await createUser(ds, { role: Role.ADMIN });
    await assignSede(adminSede.id, sede.id);
    const operadorSede = await createUser(ds, { role: Role.OPERATOR });
    await assignSede(operadorSede.id, sede.id);
    const superAdmin = await createUser(ds, {
      role: Role.ADMIN,
      isSuperAdmin: true,
    });

    // Ruido que NO debe recibir nada:
    const adminOtraSede = await createUser(ds, { role: Role.ADMIN });
    await assignSede(adminOtraSede.id, otraSede.id);
    const adminInactivo = await createUser(ds, {
      role: Role.ADMIN,
      isActive: false,
    });
    await assignSede(adminInactivo.id, sede.id);

    await service.notifyReservationPendingReview(reservation, resource);

    const rows = await ds.getRepository(Notification).find();
    const recipients = rows.map((n) => n.userId).sort();
    expect(recipients).toEqual(
      [adminSede.id, operadorSede.id, superAdmin.id].sort(),
    );
    expect(rows[0].type).toBe('reservation_pending_review');
    expect(rows[0].reservationId).toBe(reservation.id);
    expect(rows[0].isRead).toBe(false);
    expect(rows[0].message).toContain(resource.name);

    // Un correo por destinatario.
    expect(sendMail).toHaveBeenCalledTimes(3);
  });

  it('excludeUserId: el actor no se auto-notifica (CR-5)', async () => {
    const { sede, reservation, resource } = await pendingScenario();
    const actor = await createUser(ds, { role: Role.ADMIN });
    await assignSede(actor.id, sede.id);
    const otroAdmin = await createUser(ds, { role: Role.ADMIN });
    await assignSede(otroAdmin.id, sede.id);

    await service.notifyReservationPendingReview(
      reservation,
      resource,
      actor.id,
    );

    const rows = await ds.getRepository(Notification).find();
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(otroAdmin.id);
  });

  it('sin destinatarios no crea filas ni manda correos (y no revienta)', async () => {
    const { reservation, resource } = await pendingScenario();

    await service.notifyReservationPendingReview(reservation, resource);

    expect(await ds.getRepository(Notification).count()).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('un SMTP caído no impide que las notificaciones queden en el sistema', async () => {
    const { sede, reservation, resource } = await pendingScenario();
    const admin = await createUser(ds, { role: Role.ADMIN });
    await assignSede(admin.id, sede.id);
    sendMail.mockRejectedValueOnce(new Error('SMTP down'));

    await service.notifyReservationPendingReview(reservation, resource);

    expect(await ds.getRepository(Notification).count()).toBe(1);
  });

  it('apartado: cada usuario lista SOLO las suyas, con contador y marcar leídas', async () => {
    const { sede, reservation, resource } = await pendingScenario();
    const admin = await createUser(ds, { role: Role.ADMIN });
    await assignSede(admin.id, sede.id);
    const otro = await createUser(ds, { role: Role.ADMIN, isSuperAdmin: true });

    await service.notifyReservationPendingReview(reservation, resource);

    // Cada uno ve lo suyo.
    const mine = await service.findMyNotifications(admin.id);
    expect(mine.data).toHaveLength(1);
    expect(mine.meta.total).toBe(1);
    expect(mine.data[0].userId).toBe(admin.id);

    expect((await service.getUnreadCount(admin.id)).count).toBe(1);

    // Marcar una ajena → NotFound (mismo mensaje que inexistente).
    const otherNotification = (await service.findMyNotifications(otro.id))
      .data[0];
    await expect(
      service.markAsRead(otherNotification.id, admin.id),
    ).rejects.toBeInstanceOf(NotFoundException);

    // Marcar la propia sí.
    const marked = await service.markAsRead(mine.data[0].id, admin.id);
    expect(marked.isRead).toBe(true);
    expect((await service.getUnreadCount(admin.id)).count).toBe(0);
  });

  it('markAllAsRead marca todas las propias y devuelve el conteo', async () => {
    const { sede, reservation, resource } = await pendingScenario();
    const admin = await createUser(ds, { role: Role.ADMIN });
    await assignSede(admin.id, sede.id);

    // Dos avisos para el mismo admin.
    await service.notifyReservationPendingReview(reservation, resource);
    await service.notifyReservationPendingReview(reservation, resource);

    expect((await service.getUnreadCount(admin.id)).count).toBe(2);

    const result = await service.markAllAsRead(admin.id);
    expect(result.updated).toBe(2);
    expect((await service.getUnreadCount(admin.id)).count).toBe(0);
  });
});
