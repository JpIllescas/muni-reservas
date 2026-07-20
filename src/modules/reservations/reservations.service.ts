import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, DataSource, EntityManager } from 'typeorm';
import { Reservation } from './entities/reservation.entity';
import { ReservationLog } from './entities/reservation-log.entity';
import { Resource } from '../resources/entities/resource.entity';
import { Sede } from '../resources/entities/sede.entity';
import { Payment } from '../payments/entities/payment.entity';
import { User } from '../users/entities/user.entity';
import { resolveEffectiveSchedule } from '../resources/utils/schedule-resolver.util';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { ProposeReassignmentDto } from './dto/propose-reassignment.dto';
import { SetPriceDto } from './dto/set-price.dto';
import {
  ReservationStatus,
  INACTIVE_RESERVATION_STATUSES,
  NON_CANCELLABLE_RESERVATION_STATUSES,
} from '../../common/enums/reservation-status.enum';
import { ResourceType } from '../../common/enums/resource-type.enum';
import { ResourceStatus } from '../../common/enums/resource-status.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { Role } from '../../common/enums/role.enum';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { ResourceException } from '../resources/entities/resource-exception.entity';
import {
  guatemalaNow,
  hhmmToMinutes,
  addDaysToISODate,
} from '../../common/utils/date.utils';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertSedeAccess } from '../../common/utils/sede-scope.util';

@Injectable()
export class ReservationsService {
  // Transiciones que un operador/admin puede ejecutar manualmente.
  private readonly allowedTransitions: Record<string, ReservationStatus[]> = {
    [ReservationStatus.UNDER_REVIEW]: [
      ReservationStatus.APPROVED,
      ReservationStatus.REJECTED,
    ],
    [ReservationStatus.PENDING_PAYMENT]: [ReservationStatus.REJECTED],
    // CR-4: primera confirmación de la administración. Aceptar → pending_payment
    // (ahí arranca la ventana de pago); anular → rejected.
    [ReservationStatus.PENDING_CONFIRMATION]: [
      ReservationStatus.PENDING_PAYMENT,
      ReservationStatus.REJECTED,
    ],
  };

  // RES-3: estados desde los que se puede PROPONER/ACEPTAR una reasignación.
  // Activos (se mueven conservando estado) + rejected (revive al nuevo slot,
  // fallback del breadcrumb de RES-1). Se excluyen expired y cancelled.
  private readonly reassignableStatuses: ReservationStatus[] = [
    ReservationStatus.PENDING_CONFIRMATION,
    ReservationStatus.PENDING_PAYMENT,
    ReservationStatus.UNDER_REVIEW,
    ReservationStatus.APPROVED,
    ReservationStatus.REJECTED,
  ];

  // FLO-2: estados en los que el descuento aún puede cambiar: mientras el pago
  // no está resuelto. Tras aprobar (o rechazar/expirar/cancelar) el monto queda
  // congelado tal como se revisó.
  private readonly discountableStatuses: ReservationStatus[] = [
    // CR-4: también antes de aceptar (el admin revisa el DPI y ajusta la
    // tarifa de no-vecino ANTES de dar la primera confirmación).
    ReservationStatus.PENDING_CONFIRMATION,
    ReservationStatus.PENDING_PAYMENT,
    ReservationStatus.UNDER_REVIEW,
  ];

  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,

    @InjectRepository(ReservationLog)
    private readonly logRepository: Repository<ReservationLog>,

    private readonly auditService: AuditService,

    private readonly notificationsService: NotificationsService,

    private readonly dataSource: DataSource,
  ) {}

  // ADM-2 (B4): `actor` presente ⇒ la reserva la crea un admin/operador a nombre
  // de un ciudadano existente (`userId` es el ciudadano, no el actor). Se valida
  // la sede del actor y se audita. Sin `actor` es el flujo normal del ciudadano.
  async create(
    userId: string,
    dto: CreateReservationDto,
    actor?: AuthUser,
    ipAddress?: string,
  ) {
    // CR-2: referencia al recurso para el aviso post-commit (se asigna dentro
    // de la transacción, se usa después de que TODO quedó persistido).
    let notifyResource: Resource | null = null;

    // Envolvemos TODO en una transacción ACID
    const saved = await this.dataSource.transaction(async (manager) => {
      // CR-1: reservar exige identidad completa: número de DPI + las dos fotos
      // (frente y reverso), registrados desde el perfil. Se chequea ANTES del
      // lock del recurso para no serializar a quien igual va a ser rechazado.
      const reservingUser = await manager.findOne(User, {
        where: { id: userId },
      });
      if (!reservingUser) {
        throw new NotFoundException('Usuario no encontrado.');
      }
      if (
        !reservingUser.dpi ||
        !reservingUser.dpiFrontPath ||
        !reservingUser.dpiBackPath
      ) {
        throw new BadRequestException(
          actor
            ? 'El ciudadano debe tener su DPI (número y fotos) registrado para reservar a su nombre.'
            : 'Para reservar debes registrar tu DPI (número y fotos de ambos lados) en tu perfil.',
        );
      }

      // BLOQUEO PESIMISTA: Si dos personas intentan reservar ESTE recurso al mismo tiempo,
      // la base de datos hará que el segundo espere a que el primero termine.
      const resource = await manager.findOne(Resource, {
        where: { id: dto.resourceId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!resource) {
        throw new NotFoundException('Recurso no encontrado o inactivo.');
      }

      // ADM-2 (B4): el admin/operador solo crea en recursos de sus sedes.
      if (actor && !actor.isSuperAdmin) {
        assertSedeAccess(actor, resource.sedeId);
      }

      // REC-2: el recurso puede estar activo pero en mantenimiento/evento. El
      // fetch filtra por isActive (no por status), así que se chequea aquí.
      if (resource.status !== ResourceStatus.AVAILABLE) {
        throw new BadRequestException(
          resource.statusReason
            ? `El recurso no está disponible: ${resource.statusReason}.`
            : `El recurso está en ${resource.status} y no admite reservas.`,
        );
      }

      // Gate de sede: una sede inactiva oculta sus recursos y no acepta reservas
      // NUEVAS, sin cascada sobre el isActive de los recursos (al reactivar la
      // sede vuelven solos). Mismo mensaje que recurso inactivo (no filtra info).
      const sede = await manager.findOne(Sede, {
        where: { id: resource.sedeId },
      });
      if (!sede || !sede.isActive) {
        throw new NotFoundException('Recurso no encontrado o inactivo.');
      }

      const now = guatemalaNow();

      if (dto.reservationDate < now.date) {
        throw new BadRequestException(
          'No puedes reservar en una fecha pasada.',
        );
      }

      if (dto.reservationDate === now.date && dto.startTime) {
        if (hhmmToMinutes(dto.startTime) < now.minutes) {
          throw new BadRequestException(
            'La hora de inicio ya pasó el dia de hoy.',
          );
        }
      }

      const maxDate = addDaysToISODate(now.date, resource.advanceDays);

      if (dto.reservationDate > maxDate) {
        throw new BadRequestException(
          `Solo puedes reservar con un máximo de ${resource.advanceDays} días de anticipación.`,
        );
      }

      // La fecha cae en una excepción (feriado / mantenimiento)
      const exception = await manager.findOne(ResourceException, {
        where: {
          resourceId: dto.resourceId,
          exceptionDate: dto.reservationDate,
        },
      });
      if (exception) {
        throw new BadRequestException(
          `El recurso no está disponible esa fecha: ${exception.reason}.`,
        );
      }

      // Horario EFECTIVO del día: override por fecha (REC-3) > semanal. Si la
      // fecha estaba bloqueada, ya se cortó arriba (el bloqueo tiene precedencia).
      const schedule = await resolveEffectiveSchedule(
        manager,
        dto.resourceId,
        dto.reservationDate,
      );
      if (!schedule) {
        throw new BadRequestException('El recurso no atiende ese dia.');
      }

      if (resource.type === ResourceType.COURT) {
        if (!dto.startTime || !dto.endTime) {
          throw new BadRequestException(
            'Para canchas debes especificar hora de inicio y fin.',
          );
        }

        // Comparamos por minutos (no con new Date): así "9:00" (una cifra,
        // permitido por el regex del DTO) se evalúa bien y no da NaN.
        if (hhmmToMinutes(dto.startTime) >= hhmmToMinutes(dto.endTime)) {
          throw new BadRequestException(
            'La hora de inicio debe ser estrictamente anterior a la hora de fin.',
          );
        }

        const durationMinutes =
          hhmmToMinutes(dto.endTime) - hhmmToMinutes(dto.startTime);
        if (
          resource.maxDurationMinutes &&
          durationMinutes > resource.maxDurationMinutes
        ) {
          throw new BadRequestException(
            `La duración máxima por reserva es de ${resource.maxDurationMinutes} minutos.`,
          );
        }

        // La franja pedida debe caer dentro del horario de atención del día.
        if (
          hhmmToMinutes(dto.startTime) < hhmmToMinutes(schedule.openTime) ||
          hhmmToMinutes(dto.endTime) > hhmmToMinutes(schedule.closeTime)
        ) {
          throw new BadRequestException(
            `El horario debe estar entre ${schedule.openTime} y ${schedule.closeTime}.`,
          );
        }

        await manager.query(
          'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
          [userId, dto.reservationDate],
        );

        const existingCourtReservation = await manager
          .createQueryBuilder(Reservation, 'r')
          .innerJoin('r.resource', 'res')
          .where('r.userId = :userId', { userId })
          .andWhere('r.reservationDate = :date', { date: dto.reservationDate })
          .andWhere('res.type = :type', { type: ResourceType.COURT })
          .andWhere('r.status NOT IN (:...statuses)', {
            statuses: INACTIVE_RESERVATION_STATUSES,
          })
          .getOne();

        if (existingCourtReservation) {
          throw new BadRequestException(
            'Ya tienes una reserva de cancha para ese día.',
          );
        }

        const conflictingReservation = await manager
          .createQueryBuilder(Reservation, 'r')
          .where('r.resourceId = :resourceId', { resourceId: dto.resourceId })
          .andWhere('r.reservationDate = :date', { date: dto.reservationDate })
          .andWhere('r.startTime < :endTime', { endTime: dto.endTime })
          .andWhere('r.endTime > :startTime', { startTime: dto.startTime })
          .andWhere('r.status NOT IN (:...statuses)', {
            statuses: INACTIVE_RESERVATION_STATUSES,
          })
          .getOne();

        if (conflictingReservation) {
          throw new BadRequestException(
            'Ese horario ya está ocupado. Por favor elige otro.',
          );
        }
      }

      if (resource.type === ResourceType.RANCH) {
        const existingRanchReservation = await manager.findOne(Reservation, {
          where: {
            resourceId: dto.resourceId,
            reservationDate: dto.reservationDate,
            status: Not(In(INACTIVE_RESERVATION_STATUSES)),
          },
        });

        if (existingRanchReservation) {
          throw new BadRequestException(
            'Este rancho ya está reservado para esa fecha.',
          );
        }
      }

      // CR-4: una cancha con boleta nace "pendiente de aceptar" — el admin da
      // la PRIMERA confirmación. La ventana de pago NO corre aquí: arranca
      // cuando el admin acepta (updateStatus pone el deadline al pasar a
      // pending_payment). Ranchos y recursos sin boleta nacen pending_payment
      // sin deadline, igual que antes (FLO-1: pagan al llegar / por llamada).
      const needsPreConfirmation =
        resource.type === ResourceType.COURT && resource.requiresVoucher;
      const initialStatus = needsPreConfirmation
        ? ReservationStatus.PENDING_CONFIRMATION
        : ReservationStatus.PENDING_PAYMENT;

      const startTime =
        resource.type === ResourceType.COURT ? (dto.startTime ?? null) : null;
      const endTime =
        resource.type === ResourceType.COURT ? (dto.endTime ?? null) : null;

      let totalAmount: number;
      if (resource.type === ResourceType.COURT) {
        const durationHours =
          (hhmmToMinutes(dto.endTime!) - hhmmToMinutes(dto.startTime!)) / 60;
        totalAmount = Number(resource.pricePerUnit) * durationHours;
      } else {
        totalAmount = Number(resource.pricePerUnit); // rancho = día completo
      }

      const reservation = manager.create(Reservation, {
        userId,
        resourceId: dto.resourceId,
        reservationDate: dto.reservationDate,
        startTime,
        endTime,
        status: initialStatus,
        paymentDeadline: null,
        totalAmount,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
      });

      const saved = await manager.save(reservation);

      const log = new ReservationLog();
      log.reservationId = saved.id;
      log.fromStatus = null;
      log.toStatus = initialStatus;
      log.changedById = userId;
      log.reason = 'Reserva creada';

      await manager.save(log); // Si esto falla, NADA se guarda gracias a la transacción.

      notifyResource = resource;
      return saved;
    });

    // CR-2/CR-4: aviso a los admins de la sede cuando la reserva nace
    // necesitando acción de la administración: sin boleta (FLO-1, por llamada)
    // o pendiente de la primera confirmación (CR-4). Un rancho con boleta nace
    // esperando al CIUDADANO → avisa recién en uploadVoucher. FUERA de la
    // transacción y best-effort: un fallo aquí no toca la reserva.
    if (
      notifyResource &&
      (!(notifyResource as Resource).requiresVoucher ||
        saved.status === ReservationStatus.PENDING_CONFIRMATION)
    ) {
      await this.notificationsService.notifyReservationPendingReview(
        saved,
        notifyResource,
        actor?.id, // B4: si la creó un admin, no auto-notificarlo
      );
    }

    // ADM-2 (B4): rastro de la reserva creada por la administración a nombre de
    // un ciudadano. El create normal del ciudadano no se audita (es su propia acción).
    if (actor) {
      await this.auditService.createLog(
        'Reservation',
        'ADMIN_CREATE',
        actor.id,
        saved.id,
        undefined,
        {
          userId,
          resourceId: dto.resourceId,
          reservationDate: dto.reservationDate,
        },
        ipAddress,
      );
    }

    return saved;
  }

  // El ciudadano ve sus propias reservas. voucherCount indica si tiene boleta
  // adjunta (para el botón "Ver boleta" del frontend).
  async findMyReservations(userId: string) {
    return this.reservationRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.resource', 'resource')
      .loadRelationCountAndMap('r.voucherCount', 'r.payments', 'p', (qb) =>
        qb.where('p.voucherPath IS NOT NULL'),
      )
      .where('r.userId = :userId', { userId })
      .orderBy('r.createdAt', 'DESC')
      .getMany();
  }

  // Admin y operador ven las reservas de SUS sedes (ADM-1). El super-admin ve todas.
  async findAll(
    user: AuthUser,
    status?: ReservationStatus,
    page: number = 1,
    limit: number = 10,
  ) {
    // Fail-closed: admin/operador sin sedes asignadas (y sin flag) no ve nada.
    if (!user.isSuperAdmin && user.sedeIds.length === 0) {
      return {
        data: [],
        meta: { total: 0, page, limit, totalPages: 0 },
      };
    }

    const query = this.reservationRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.resource', 'resource')
      .leftJoinAndSelect('r.user', 'user')
      .loadRelationCountAndMap('r.voucherCount', 'r.payments', 'p', (qb) =>
        qb.where('p.voucherPath IS NOT NULL'),
      )
      .orderBy('r.createdAt', 'DESC');

    if (status) {
      query.andWhere('r.status = :status', { status });
    }

    // Acotar por sede salvo super-admin.
    if (!user.isSuperAdmin) {
      query.andWhere('resource.sedeId IN (:...sedeIds)', {
        sedeIds: user.sedeIds,
      });
    }

    // Calcular cuantos registros saltar segun la pagina
    const skip = (page - 1) * limit;

    // Aplicar la paginacion a nivel de base de datos
    query.skip(skip).take(limit);

    // Obtener los datos y el total general para el frontend
    const [data, total] = await query.getManyAndCount();

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Ver detalle de una reserva
  async findOne(id: string, user: AuthUser) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['resource', 'user'],
    });

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }

    // El ciudadano solo puede ver sus propias reservas.
    if (user.role === Role.CITIZEN) {
      if (reservation.userId !== user.id) {
        throw new ForbiddenException(
          'No tienes permiso para ver esta reserva.',
        );
      }
    } else {
      // Admin/operador: solo reservas de recursos de sus sedes (ADM-1).
      assertSedeAccess(user, reservation.resource.sedeId);
    }

    return reservation;
  }

  // Admin u operador cambia el estado de una reserva
  async updateStatus(
    id: string,
    dto: UpdateReservationStatusDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const changedById = user.id;
    const { reservation, fromStatus } = await this.dataSource.transaction(
      async (manager) => {
        const found = await manager.findOne(Reservation, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!found) {
          throw new NotFoundException('Reserva no encontrada.');
        }

        // Se carga el recurso siempre: para el chequeo de sede (ADM-1) y para
        // saber si exige boleta (FLO-1). La FK garantiza que existe.
        const resource = await manager.findOne(Resource, {
          where: { id: found.resourceId },
        });

        // Admin/operador solo gestiona reservas de recursos de sus sedes (ADM-1).
        if (!user.isSuperAdmin) {
          assertSedeAccess(user, resource!.sedeId);
        }

        const fromStatus = found.status;

        // Reserva EXONERADA (totalAmount = 0, ej. colegio/municipalidad vía
        // "editar precio" con motivo): no hay pago que exigir ni boleta que
        // registrar; se aprueba directo y el rastro queda en el ajuste de
        // precio (discountReason) + logs.
        const exonerated = found.totalAmount === 0;

        // 1. Validar la transición contra la máquina de estados.
        //    FLO-1: un recurso de confirmación por llamada (requiresVoucher=false)
        //    puede aprobarse directo desde pending_payment, sin pasar por revisión.
        //    Una exonerada también (no va a llegar ninguna boleta).
        const allowed = this.allowedTransitions[fromStatus] ?? [];
        const approveWithoutVoucher =
          (!resource!.requiresVoucher || exonerated) &&
          fromStatus === ReservationStatus.PENDING_PAYMENT &&
          dto.status === ReservationStatus.APPROVED;

        if (!allowed.includes(dto.status) && !approveWithoutVoucher) {
          throw new BadRequestException(
            `Transición inválida: no se puede pasar una reserva de "${fromStatus}" a "${dto.status}".`,
          );
        }

        // 2. Aprobar exige un pago registrado SOLO si el recurso pide boleta
        //    (FLO-1) y la reserva no está exonerada.
        if (
          dto.status === ReservationStatus.APPROVED &&
          resource!.requiresVoucher &&
          !exonerated
        ) {
          const payment = await manager.findOne(Payment, {
            where: { reservationId: id },
          });
          if (!payment) {
            throw new BadRequestException(
              'No se puede aprobar una reserva sin un pago registrado.',
            );
          }
        }

        // 2b. CR-7: aprobar un recurso SIN comprobante exige el número de la
        // boleta física (pagan en efectivo al llegar) y deja un Payment cash
        // aprobado en la misma transacción: constancia fiscalizable en vez de
        // la aprobación "al aire" que permitía FLO-1. Una exonerada no paga
        // nada → sin boleta ni Payment.
        if (approveWithoutVoucher && !exonerated) {
          if (!dto.receiptNumber) {
            throw new BadRequestException(
              'Para aprobar esta reserva debes indicar el número de boleta.',
            );
          }
          const now = new Date();
          const payment = manager.create(Payment, {
            reservationId: id,
            method: PaymentMethod.CASH,
            status: PaymentStatus.APPROVED,
            transactionReference: dto.receiptNumber,
            submittedAt: now,
            reviewedAt: now,
            reviewedById: user.id,
          });
          await manager.save(payment);
        }

        // 3. Aplicar el cambio.
        found.status = dto.status;
        if (dto.status === ReservationStatus.APPROVED) {
          found.confirmedAt = new Date();
        }
        if (dto.status === ReservationStatus.REJECTED) {
          found.rejectionReason = dto.reason;
        }
        // CR-4: primera confirmación (aceptar). La ventana de pago arranca
        // AQUÍ, no al crear: así el plazo no se quema esperando al admin.
        // Una exonerada no espera boleta → sin deadline (el cron no la expira).
        if (
          fromStatus === ReservationStatus.PENDING_CONFIRMATION &&
          dto.status === ReservationStatus.PENDING_PAYMENT &&
          resource!.requiresVoucher &&
          !exonerated
        ) {
          const deadline = new Date();
          deadline.setHours(deadline.getHours() + resource!.paymentWindowHours);
          found.paymentDeadline = deadline;
        }
        await manager.save(found);

        // 4. Log inmutable del cambio (dentro de la misma tx: todo o nada).
        const log = new ReservationLog();
        log.reservationId = id;
        log.fromStatus = fromStatus;
        log.toStatus = dto.status;
        log.changedById = changedById;
        log.reason = dto.reason ?? null;
        await manager.save(log);

        const reservation = await manager.findOne(Reservation, {
          where: { id },
          relations: ['user', 'resource'],
        });

        return { reservation, fromStatus };
      },
    );

    // 5. Auditoría de la acción administrativa (fuera de la transacción).
    await this.auditService.createLog(
      'Reservation',
      `STATUS_${dto.status.toUpperCase()}`,
      changedById,
      id,
      { status: fromStatus },
      { status: dto.status },
      ipAddress,
    );

    // 6. Notificación FUERA de la transacción: no mantenemos el lock
    // abierto mientras esperamos al servidor SMTP.
    if (reservation && reservation.user) {
      await this.notificationsService.sendReservationStatusEmail(
        reservation.user,
        reservation,
        dto.status,
        dto.reason,
      );
    }

    return reservation;
  }

  // CR-3: el admin fija el PRECIO FINAL de una reserva puntual (carta/acuerdo
  // que no encaja como descuento simple, o un ajuste hacia arriba). Se apoya en
  // las MISMAS columnas de FLO-2: discountAmount = original − nuevo precio
  // (negativo si el precio sube), así el monto original nunca se pierde y las
  // dos vías (descuento y precio) son consistentes entre sí. totalAmount sigue
  // siendo SIEMPRE el monto final a pagar (ARQ-1). Misma ventana y candado que
  // solo mientras el pago no está resuelto.
  async setPrice(
    id: string,
    dto: SetPriceDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const { reservation, oldValues } = await this.dataSource.transaction(
      async (manager) => {
        // Candado pesimista: serializa contra updateStatus.
        const found = await manager.findOne(Reservation, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!found) {
          throw new NotFoundException('Reserva no encontrada.');
        }

        // ADM-1: solo reservas de recursos de las sedes del actor.
        const resource = await manager.findOne(Resource, {
          where: { id: found.resourceId },
        });
        if (!user.isSuperAdmin) {
          assertSedeAccess(user, resource!.sedeId);
        }

        if (!this.discountableStatuses.includes(found.status)) {
          throw new BadRequestException(
            'Solo se puede editar el precio mientras la reserva está pendiente de pago o en revisión.',
          );
        }

        // Monto original (sin ajuste vigente): el precio nuevo se fija SIEMPRE
        // respecto al original, no sobre un ajuste previo.
        const original = round2(
          found.totalAmount + (found.discountAmount ?? 0),
        );
        const oldValues = {
          totalAmount: found.totalAmount,
          discountAmount: found.discountAmount,
          discountReason: found.discountReason,
        };

        const adjustment = round2(original - dto.newTotal);

        if (adjustment === 0) {
          if (found.discountAmount === null) {
            throw new BadRequestException(
              'La reserva ya tiene ese precio; no hay nada que cambiar.',
            );
          }
          // Fijar el precio original = quitar el ajuste vigente.
          found.discountAmount = null;
          found.discountReason = null;
          found.discountAppliedBy = null;
          found.discountAppliedAt = null;
          found.totalAmount = original;
        } else {
          found.discountAmount = adjustment;
          found.discountReason = dto.reason;
          found.discountAppliedBy = user.id;
          found.discountAppliedAt = new Date();
          found.totalAmount = round2(dto.newTotal);
        }

        // Exoneración vs. ventana de pago (canchas con boleta): a Q0 se quita
        // el deadline (no espera boleta, el cron no debe expirarla); si vuelve
        // a ser > 0 en pending_payment, se abre una ventana fresca.
        if (
          found.status === ReservationStatus.PENDING_PAYMENT &&
          resource!.type === ResourceType.COURT &&
          resource!.requiresVoucher
        ) {
          if (found.totalAmount === 0) {
            found.paymentDeadline = null;
          } else if (!found.paymentDeadline) {
            const deadline = new Date();
            deadline.setHours(
              deadline.getHours() + resource!.paymentWindowHours,
            );
            found.paymentDeadline = deadline;
          }
        }

        await manager.save(found);
        return { reservation: found, oldValues };
      },
    );

    // Auditoría fuera de la transacción (mismo criterio que updateStatus).
    await this.auditService.createLog(
      'Reservation',
      'SET_PRICE',
      user.id,
      id,
      oldValues,
      {
        totalAmount: reservation.totalAmount,
        discountAmount: reservation.discountAmount,
        discountReason: reservation.discountReason,
      },
      ipAddress,
    );

    return reservation;
  }

  // RES-1: el admin revierte un rechazo hecho por error, SOLO si el horario
  // original sigue libre. Si ya fue tomado, se rechaza y queda para la
  // reasignación con aprobación del ciudadano (RES-3, futuro). Restaura el estado
  // que la reserva tenía ANTES del rechazo (leído del log). Acción de admin.
  async revertRejection(id: string, user: AuthUser, ipAddress?: string) {
    const { reservation, toStatus } = await this.dataSource.transaction(
      async (manager) => {
        const found = await manager.findOne(Reservation, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!found) {
          throw new NotFoundException('Reserva no encontrada.');
        }
        if (found.status !== ReservationStatus.REJECTED) {
          throw new BadRequestException(
            'Solo se puede revertir una reserva rechazada.',
          );
        }

        // Candado pesimista sobre el recurso: serializa contra creates concurrentes
        // del mismo slot (igual que create()).
        const resource = await manager.findOne(Resource, {
          where: { id: found.resourceId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!resource) {
          throw new NotFoundException('Recurso no encontrado.');
        }

        // Admin/operador solo gestiona reservas de recursos de sus sedes (ADM-1).
        if (!user.isSuperAdmin) {
          assertSedeAccess(user, resource.sedeId);
        }

        // El recurso debe poder recibir reservas (activo y disponible).
        if (
          !resource.isActive ||
          resource.status !== ResourceStatus.AVAILABLE
        ) {
          throw new BadRequestException(
            'El recurso no está disponible; no se puede revertir la reserva.',
          );
        }

        // No tiene sentido revivir una reserva de una fecha que ya pasó.
        const now = guatemalaNow();
        if (found.reservationDate < now.date) {
          throw new BadRequestException(
            'No se puede revertir una reserva de una fecha pasada.',
          );
        }

        // La fecha pudo quedar bloqueada despues del rechazo
        const exception = await manager.findOne(ResourceException, {
          where: {
            resourceId: found.resourceId,
            exceptionDate: found.reservationDate,
          },
        });
        if (exception) {
          throw new BadRequestException(
            `El recurso ya no está disponible esa fecha: ${exception.reason}.`,
          );
        }

        // Horario EFECTIVO del día (override REC-3 > semanal); pudo cambiar tras
        // el rechazo. El bloqueo por excepción ya se validó arriba (mayor precedencia).
        const schedule = await resolveEffectiveSchedule(
          manager,
          found.resourceId,
          found.reservationDate,
        );
        if (!schedule) {
          throw new BadRequestException('El recurso ya no atiende ese día.');
        }

        // El slot debe seguir libre. Self está REJECTED (inactivo) → no aparece
        // en estas consultas, no hace falta excluirlo explícitamente.
        if (resource.type === ResourceType.COURT) {
          await manager.query(
            'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
            [found.userId, found.reservationDate],
          );

          const existingCourt = await manager
            .createQueryBuilder(Reservation, 'r')
            .innerJoin('r.resource', 'res')
            .where('r.userId = :userId', { userId: found.userId })
            .andWhere('r.reservationDate = :date', {
              date: found.reservationDate,
            })
            .andWhere('res.type = :type', { type: ResourceType.COURT })
            .andWhere('r.status NOT IN (:...statuses)', {
              statuses: INACTIVE_RESERVATION_STATUSES,
            })
            .getOne();
          if (existingCourt) {
            throw new BadRequestException(
              'El ciudadano ya tiene otra reserva de cancha activa ese día.',
            );
          }

          const conflicting = await manager
            .createQueryBuilder(Reservation, 'r')
            .where('r.resourceId = :resourceId', {
              resourceId: found.resourceId,
            })
            .andWhere('r.reservationDate = :date', {
              date: found.reservationDate,
            })
            .andWhere('r.startTime < :endTime', { endTime: found.endTime })
            .andWhere('r.endTime > :startTime', { startTime: found.startTime })
            .andWhere('r.status NOT IN (:...statuses)', {
              statuses: INACTIVE_RESERVATION_STATUSES,
            })
            .getOne();
          if (conflicting) {
            throw new BadRequestException(
              'El horario ya fue tomado por otra reserva; usa la reasignación.',
            );
          }
        }

        if (resource.type === ResourceType.RANCH) {
          const existingRanch = await manager.findOne(Reservation, {
            where: {
              resourceId: found.resourceId,
              reservationDate: found.reservationDate,
              status: Not(In(INACTIVE_RESERVATION_STATUSES)),
            },
          });
          if (existingRanch) {
            throw new BadRequestException(
              'El rancho ya está reservado esa fecha; usa la reasignación.',
            );
          }
        }

        // Estado destino = el que tenía justo antes del rechazo (del log). El
        // único origen válido de un rechazo es UNDER_REVIEW o PENDING_PAYMENT.
        const rejectLog = await manager.findOne(ReservationLog, {
          where: { reservationId: id, toStatus: ReservationStatus.REJECTED },
          order: { createdAt: 'DESC' },
        });
        let toStatus =
          rejectLog?.fromStatus ?? ReservationStatus.PENDING_PAYMENT;
        if (
          toStatus !== ReservationStatus.UNDER_REVIEW &&
          toStatus !== ReservationStatus.PENDING_PAYMENT
        ) {
          toStatus = ReservationStatus.PENDING_PAYMENT;
        }

        found.status = toStatus;
        found.rejectionReason = null;
        // Si vuelve a pending_payment y el recurso cobra por hora con boleta, se
        // le da una ventana de pago FRESCA (si no, el cron lo re-expira al toque).
        if (
          toStatus === ReservationStatus.PENDING_PAYMENT &&
          resource.type === ResourceType.COURT &&
          resource.requiresVoucher
        ) {
          const deadline = new Date();
          deadline.setHours(deadline.getHours() + resource.paymentWindowHours);
          found.paymentDeadline = deadline;
        } else {
          found.paymentDeadline = null;
        }
        await manager.save(found);

        const log = new ReservationLog();
        log.reservationId = id;
        log.fromStatus = ReservationStatus.REJECTED;
        log.toStatus = toStatus;
        log.changedById = user.id;
        log.reason = 'Rechazo revertido por la administración';
        await manager.save(log);

        const reservation = await manager.findOne(Reservation, {
          where: { id },
          relations: ['user', 'resource'],
        });

        return { reservation, toStatus };
      },
    );

    await this.auditService.createLog(
      'Reservation',
      'REVERT_REJECTION',
      user.id,
      id,
      { status: ReservationStatus.REJECTED },
      { status: toStatus },
      ipAddress,
    );

    if (reservation && reservation.user) {
      await this.notificationsService.sendReservationStatusEmail(
        reservation.user,
        reservation,
        toStatus,
        'Rechazo revertido por la administración',
      );
    }

    return reservation;
  }

  // ==========================================================================
  // RES-3 — Reasignación de horario con aprobación del ciudadano (Shape B).
  // ==========================================================================

  // El admin/operador PROPONE un nuevo slot. NO valida disponibilidad ni ocupa
  // el horario (Shape B pto 2): solo lo aparta en proposed_*. Sobrescribe una
  // propuesta previa (una sola propuesta viva).
  async proposeReassignment(
    id: string,
    dto: ProposeReassignmentDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['resource', 'user'],
    });
    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }

    // Gating de sede (ADM-1): admin/operador solo sobre recursos de sus sedes.
    if (!user.isSuperAdmin) {
      assertSedeAccess(user, reservation.resource.sedeId);
    }

    // Solo se propone sobre estados reasignables (no expired/cancelled).
    if (!this.reassignableStatuses.includes(reservation.status)) {
      throw new BadRequestException(
        `No se puede proponer una reasignación para una reserva en estado "${reservation.status}".`,
      );
    }

    const resource = reservation.resource;
    let proposedStart: string | null = null;
    let proposedEnd: string | null = null;

    // Validación de FORMA (no de disponibilidad) según el tipo de recurso.
    if (resource.type === ResourceType.COURT) {
      if (!dto.proposedStartTime || !dto.proposedEndTime) {
        throw new BadRequestException(
          'Para canchas debes proponer hora de inicio y fin.',
        );
      }
      if (
        hhmmToMinutes(dto.proposedStartTime) >=
        hhmmToMinutes(dto.proposedEndTime)
      ) {
        throw new BadRequestException(
          'La hora de inicio debe ser estrictamente anterior a la hora de fin.',
        );
      }
      proposedStart = dto.proposedStartTime;
      proposedEnd = dto.proposedEndTime;
    }
    // RANCH: start/end quedan null (día completo).

    reservation.proposedDate = dto.proposedDate;
    reservation.proposedStartTime = proposedStart;
    reservation.proposedEndTime = proposedEnd;
    reservation.proposedBy = user.id;
    reservation.proposedAt = new Date();
    reservation.proposedReason = dto.reason;
    await this.reservationRepository.save(reservation);

    await this.auditService.createLog(
      'Reservation',
      'PROPOSE_REASSIGNMENT',
      user.id,
      id,
      {
        date: reservation.reservationDate,
        startTime: reservation.startTime,
        endTime: reservation.endTime,
      },
      {
        date: dto.proposedDate,
        startTime: proposedStart,
        endTime: proposedEnd,
        reason: dto.reason,
      },
      ipAddress,
    );

    // Aviso al ciudadano FUERA de la persistencia; silencioso si el SMTP falla
    // (la propuesta ya quedó guardada y también se ve dentro del sistema).
    if (reservation.user) {
      await this.notificationsService.sendReassignmentProposalEmail(
        reservation.user,
        reservation,
      );
    }

    return reservation;
  }

  // El ciudadano dueño ACEPTA: mueve la reserva al slot propuesto. Todo en una
  // transacción con pessimistic_write + advisory lock; el backstop de BD
  // (23P01 / 23505) es la red final si el slot se ocupó en carrera.
  async acceptReassignment(id: string, user: AuthUser, ipAddress?: string) {
    const { reservation, fromStatus, toStatus } =
      await this.dataSource.transaction(async (manager) => {
        const found = await manager.findOne(Reservation, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!found) {
          throw new NotFoundException('Reserva no encontrada.');
        }
        // Solo el dueño acepta su propia reasignación.
        if (found.userId !== user.id) {
          throw new ForbiddenException('No tienes permiso sobre esta reserva.');
        }
        // Debe haber una propuesta viva.
        if (!found.proposedDate) {
          throw new BadRequestException(
            'Esta reserva no tiene una propuesta de reasignación pendiente.',
          );
        }
        // La reserva pudo caer a expired/cancelled mientras la propuesta esperaba.
        if (!this.reassignableStatuses.includes(found.status)) {
          throw new BadRequestException(
            'La reserva ya no admite reasignación.',
          );
        }

        const resource = await manager.findOne(Resource, {
          where: { id: found.resourceId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!resource) {
          throw new NotFoundException('Recurso no encontrado.');
        }
        if (
          !resource.isActive ||
          resource.status !== ResourceStatus.AVAILABLE
        ) {
          throw new BadRequestException(
            'El recurso no está disponible; no se puede aceptar la reasignación.',
          );
        }

        // No aceptar hacia una fecha ya pasada.
        const now = guatemalaNow();
        if (found.proposedDate < now.date) {
          throw new BadRequestException('La fecha propuesta ya pasó.');
        }

        // Gating de disponibilidad del slot propuesto (EXCLUYE la propia reserva:
        // en la rama activa aún ocupa su slot viejo y no debe chocar consigo misma).
        await this.assertSlotAvailable(
          manager,
          resource,
          found.proposedDate,
          found.proposedStartTime,
          found.proposedEndTime,
          found.userId,
          found.id,
        );

        const fromStatus = found.status;

        // Mover al slot propuesto.
        found.reservationDate = found.proposedDate;
        found.startTime =
          resource.type === ResourceType.COURT ? found.proposedStartTime : null;
        found.endTime =
          resource.type === ResourceType.COURT ? found.proposedEndTime : null;

        // Estado destino: rama activa conserva; rama revivir (rejected) restaura
        // el estado previo al rechazo (del log) + ventana de pago fresca.
        let toStatus = fromStatus;
        if (fromStatus === ReservationStatus.REJECTED) {
          const rejectLog = await manager.findOne(ReservationLog, {
            where: { reservationId: id, toStatus: ReservationStatus.REJECTED },
            order: { createdAt: 'DESC' },
          });
          toStatus = rejectLog?.fromStatus ?? ReservationStatus.PENDING_PAYMENT;
          if (
            toStatus !== ReservationStatus.UNDER_REVIEW &&
            toStatus !== ReservationStatus.PENDING_PAYMENT
          ) {
            toStatus = ReservationStatus.PENDING_PAYMENT;
          }
          found.status = toStatus;
          found.rejectionReason = null;
          if (
            toStatus === ReservationStatus.PENDING_PAYMENT &&
            resource.type === ResourceType.COURT &&
            resource.requiresVoucher
          ) {
            const deadline = new Date();
            deadline.setHours(
              deadline.getHours() + resource.paymentWindowHours,
            );
            found.paymentDeadline = deadline;
          } else {
            found.paymentDeadline = null;
          }
        }

        // Limpiar la propuesta.
        found.proposedDate = null;
        found.proposedStartTime = null;
        found.proposedEndTime = null;
        found.proposedBy = null;
        found.proposedAt = null;
        found.proposedReason = null;

        await manager.save(found); // dispara el backstop si el slot ya se ocupó

        const log = new ReservationLog();
        log.reservationId = id;
        log.fromStatus = fromStatus;
        log.toStatus = toStatus;
        log.changedById = user.id;
        log.reason = 'Reasignación de horario aceptada por el ciudadano';
        await manager.save(log);

        const reservation = await manager.findOne(Reservation, {
          where: { id },
          relations: ['user', 'resource'],
        });

        return { reservation, fromStatus, toStatus };
      });

    await this.auditService.createLog(
      'Reservation',
      'ACCEPT_REASSIGNMENT',
      user.id,
      id,
      { status: fromStatus },
      { status: toStatus },
      ipAddress,
    );

    return reservation;
  }

  // El ciudadano dueño RECHAZA la propuesta: limpia proposed_*; la reserva
  // queda intacta (mismo slot y estado). No toca columnas reales → sin backstop.
  async rejectReassignment(id: string, user: AuthUser, ipAddress?: string) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
    });
    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }
    if (reservation.userId !== user.id) {
      throw new ForbiddenException('No tienes permiso sobre esta reserva.');
    }
    if (!reservation.proposedDate) {
      throw new BadRequestException(
        'Esta reserva no tiene una propuesta de reasignación pendiente.',
      );
    }

    reservation.proposedDate = null;
    reservation.proposedStartTime = null;
    reservation.proposedEndTime = null;
    reservation.proposedBy = null;
    reservation.proposedAt = null;
    reservation.proposedReason = null;
    await this.reservationRepository.save(reservation);

    await this.auditService.createLog(
      'Reservation',
      'REJECT_REASSIGNMENT',
      user.id,
      id,
      { proposal: 'pending' },
      { proposal: 'rejected' },
      ipAddress,
    );

    return { message: 'Propuesta de reasignación rechazada.' };
  }

  // Gating de disponibilidad compartido (RES-3). Lanza BadRequest si el slot no
  // está libre; no devuelve nada si está disponible. `excludeReservationId` evita
  // que una reserva que se mueve choque consigo misma en solape/límite diario.
  private async assertSlotAvailable(
    manager: EntityManager,
    resource: Resource,
    date: string,
    startTime: string | null,
    endTime: string | null,
    userId: string,
    excludeReservationId?: string,
  ): Promise<void> {
    // Fecha bloqueada por excepción (feriado / mantenimiento).
    const exception = await manager.findOne(ResourceException, {
      where: { resourceId: resource.id, exceptionDate: date },
    });
    if (exception) {
      throw new BadRequestException(
        `El recurso no está disponible esa fecha: ${exception.reason}.`,
      );
    }

    // Horario EFECTIVO del día: override por fecha (REC-3) > semanal.
    const schedule = await resolveEffectiveSchedule(manager, resource.id, date);
    if (!schedule) {
      throw new BadRequestException('El recurso no atiende ese día.');
    }

    if (resource.type === ResourceType.COURT) {
      if (!startTime || !endTime) {
        throw new BadRequestException(
          'Para canchas debes especificar hora de inicio y fin.',
        );
      }
      if (hhmmToMinutes(startTime) >= hhmmToMinutes(endTime)) {
        throw new BadRequestException(
          'La hora de inicio debe ser estrictamente anterior a la hora de fin.',
        );
      }
      const durationMinutes = hhmmToMinutes(endTime) - hhmmToMinutes(startTime);
      if (
        resource.maxDurationMinutes &&
        durationMinutes > resource.maxDurationMinutes
      ) {
        throw new BadRequestException(
          `La duración máxima por reserva es de ${resource.maxDurationMinutes} minutos.`,
        );
      }
      if (
        hhmmToMinutes(startTime) < hhmmToMinutes(schedule.openTime) ||
        hhmmToMinutes(endTime) > hhmmToMinutes(schedule.closeTime)
      ) {
        throw new BadRequestException(
          `El horario debe estar entre ${schedule.openTime} y ${schedule.closeTime}.`,
        );
      }

      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))',
        [userId, date],
      );

      // Límite: 1 cancha activa por usuario por día (excluye la propia reserva).
      const existingCourtQb = manager
        .createQueryBuilder(Reservation, 'r')
        .innerJoin('r.resource', 'res')
        .where('r.userId = :userId', { userId })
        .andWhere('r.reservationDate = :date', { date })
        .andWhere('res.type = :type', { type: ResourceType.COURT })
        .andWhere('r.status NOT IN (:...statuses)', {
          statuses: INACTIVE_RESERVATION_STATUSES,
        });
      if (excludeReservationId) {
        existingCourtQb.andWhere('r.id != :excludeId', {
          excludeId: excludeReservationId,
        });
      }
      if (await existingCourtQb.getOne()) {
        throw new BadRequestException(
          'Ya existe una reserva de cancha activa para ese día.',
        );
      }

      // Solape de horario (excluye la propia reserva).
      const conflictingQb = manager
        .createQueryBuilder(Reservation, 'r')
        .where('r.resourceId = :resourceId', { resourceId: resource.id })
        .andWhere('r.reservationDate = :date', { date })
        .andWhere('r.startTime < :endTime', { endTime })
        .andWhere('r.endTime > :startTime', { startTime })
        .andWhere('r.status NOT IN (:...statuses)', {
          statuses: INACTIVE_RESERVATION_STATUSES,
        });
      if (excludeReservationId) {
        conflictingQb.andWhere('r.id != :excludeId', {
          excludeId: excludeReservationId,
        });
      }
      if (await conflictingQb.getOne()) {
        throw new BadRequestException(
          'Ese horario ya está ocupado. Por favor elige otro.',
        );
      }
    }

    if (resource.type === ResourceType.RANCH) {
      const existingRanchQb = manager
        .createQueryBuilder(Reservation, 'r')
        .where('r.resourceId = :resourceId', { resourceId: resource.id })
        .andWhere('r.reservationDate = :date', { date })
        .andWhere('r.status NOT IN (:...statuses)', {
          statuses: INACTIVE_RESERVATION_STATUSES,
        });
      if (excludeReservationId) {
        existingRanchQb.andWhere('r.id != :excludeId', {
          excludeId: excludeReservationId,
        });
      }
      if (await existingRanchQb.getOne()) {
        throw new BadRequestException(
          'Este rancho ya está reservado para esa fecha.',
        );
      }
    }
  }

  // El ciudadano cancela su propia reserva
  async cancel(id: string, userId: string) {
    const reservation = await this.reservationRepository.findOne({
      where: { id, userId },
      relations: ['user', 'resource'],
    });

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }

    if (NON_CANCELLABLE_RESERVATION_STATUSES.includes(reservation.status)) {
      throw new BadRequestException('Esta reserva no puede ser cancelada.');
    }

    const fromStatus = reservation.status;
    reservation.status = ReservationStatus.CANCELLED;
    await this.reservationRepository.save(reservation);

    const log = new ReservationLog();
    log.reservationId = id;
    log.fromStatus = fromStatus;
    log.toStatus = ReservationStatus.CANCELLED;
    log.changedById = userId;
    log.reason = 'Cancelada por el usuario';
    await this.logRepository.save(log);

    // Aviso de anulación (best-effort: el método traga errores de SMTP).
    if (reservation.user) {
      await this.notificationsService.sendReservationStatusEmail(
        reservation.user,
        reservation,
        ReservationStatus.CANCELLED,
      );
    }

    return { message: 'Reserva cancelada correctamente.' };
  }

  // Cron cada 5 min: expira reservas vencidas y recuerda validaciones pendientes.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireOverdueReservations() {
    // Dos barridos de expiración en una sola transacción (todo o nada con sus logs):
    // (1) pending_payment con payment_deadline vencido.
    // (2) pending_confirmation sin la 1ª confirmación dentro de su ventana.
    // Ambos liberan el slot: 'expired' sale del set activo.
    const expiredIds = await this.dataSource.transaction(async (manager) => {
      const paymentSweep = await manager
        .createQueryBuilder()
        .update(Reservation)
        .set({ status: ReservationStatus.EXPIRED })
        .where('status = :status', {
          status: ReservationStatus.PENDING_PAYMENT,
        })
        .andWhere('paymentDeadline IS NOT NULL')
        .andWhere('paymentDeadline < :now', { now: new Date() })
        .returning(['id'])
        .execute();
      const paymentIds = (paymentSweep.raw as { id: string }[]).map(
        (r) => r.id,
      );

      const confRows: { id: string }[] = await manager.query(`
        UPDATE "reservations" r
        SET status = 'expired'
        FROM "resources" res
        WHERE r.resource_id = res.id
          AND r.status = 'pending_confirmation'
          AND r.created_at + (res.confirmation_window_hours * interval '1 hour') < now()
        RETURNING r.id
      `);
      const confIds = confRows.map((r) => r.id);

      const logs: ReservationLog[] = [];
      for (const id of paymentIds) {
        const log = new ReservationLog();
        log.reservationId = id;
        log.fromStatus = ReservationStatus.PENDING_PAYMENT;
        log.toStatus = ReservationStatus.EXPIRED;
        log.changedById = null;
        log.reason = 'Expirada por vencimiento del plazo de pago';
        logs.push(log);
      }
      for (const id of confIds) {
        const log = new ReservationLog();
        log.reservationId = id;
        log.fromStatus = ReservationStatus.PENDING_CONFIRMATION;
        log.toStatus = ReservationStatus.EXPIRED;
        log.changedById = null;
        log.reason = 'Expirada por falta de confirmación de la administración';
        logs.push(log);
      }
      if (logs.length > 0) {
        await manager.save(logs);
      }

      return [...paymentIds, ...confIds];
    });

    // Aviso de vencimiento al ciudadano, FUERA de la transacción y best-effort.
    if (expiredIds.length > 0) {
      const expired = await this.reservationRepository.find({
        where: { id: In(expiredIds) },
        relations: ['user', 'resource'],
      });
      for (const reservation of expired) {
        if (reservation.user) {
          await this.notificationsService.sendReservationStatusEmail(
            reservation.user,
            reservation,
            ReservationStatus.EXPIRED,
          );
        }
      }
    }

    await this.remindPendingReviews();
    return expiredIds.length;
  }

  // POL-2: recuerda a la administración las boletas en revisión que superaron su
  // validation_window_minutes. Una sola vez por reserva (review_reminded_at), así
  // el cron no reenvía el aviso cada 5 min.
  private async remindPendingReviews(): Promise<number> {
    const rows: { id: string }[] = await this.dataSource.query(`
      UPDATE "reservations" r
      SET review_reminded_at = now()
      FROM "resources" res
      WHERE r.resource_id = res.id
        AND r.status = 'under_review'
        AND r.review_reminded_at IS NULL
        AND r.updated_at + (res.validation_window_minutes * interval '1 minute') < now()
      RETURNING r.id
    `);
    if (rows.length === 0) {
      return 0;
    }

    const reservations = await this.reservationRepository.find({
      where: { id: In(rows.map((r) => r.id)) },
      relations: ['resource'],
    });
    for (const reservation of reservations) {
      await this.notificationsService.notifyReservationPendingReview(
        reservation,
        reservation.resource,
      );
    }
    return rows.length;
  }

  // B7: línea de tiempo de cambios de estado de una reserva (reservation_logs).
  // El ciudadano solo ve su propia reserva; admin/operador, las de sus sedes.
  async getHistory(id: string, user: AuthUser) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['resource'],
    });
    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }

    if (user.role === Role.CITIZEN) {
      if (reservation.userId !== user.id) {
        throw new ForbiddenException(
          'No tienes permiso para ver esta reserva.',
        );
      }
    } else {
      assertSedeAccess(user, reservation.resource.sedeId);
    }

    const logs = await this.logRepository.find({
      where: { reservationId: id },
      relations: ['changedBy'],
      order: { createdAt: 'ASC' },
    });

    return logs.map((log) => ({
      id: log.id,
      fromStatus: log.fromStatus,
      toStatus: log.toStatus,
      reason: log.reason,
      createdAt: log.createdAt,
      changedBy: log.changedBy
        ? { id: log.changedBy.id, fullName: log.changedBy.fullName }
        : null,
    }));
  }
}
