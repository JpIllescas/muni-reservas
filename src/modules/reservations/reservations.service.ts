import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not, DataSource } from 'typeorm';
import { Reservation } from './entities/reservation.entity';
import { ReservationLog } from './entities/reservation-log.entity';
import { Resource } from '../resources/entities/resource.entity';
import { Payment } from '../payments/entities/payment.entity';
import { ResourceSchedule } from '../resources/entities/resource-schedule.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { ReservationStatus } from '../../common/enums/reservation-status.enum';
import { ResourceType } from '../../common/enums/resource-type.enum';
import { Role } from '../../common/enums/role.enum';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { ResourceException } from '../resources/entities/resource-exception.entity';
import {
  guatemalaNow,
  hhmmToMinutes,
  addDaysToISODate,
  dayOfWeekFromISODate,
} from '../../common/utils/date.utils';

@Injectable()
export class ReservationsService {
  // Transiciones que un operador/admin puede ejecutar manualmente.
  private readonly allowedTransitions: Record<string, ReservationStatus[]> = {
    [ReservationStatus.UNDER_REVIEW]: [
      ReservationStatus.APPROVED,
      ReservationStatus.REJECTED,
    ],
    [ReservationStatus.PENDING_PAYMENT]: [ReservationStatus.REJECTED],
  };

  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,

    @InjectRepository(ReservationLog)
    private readonly logRepository: Repository<ReservationLog>,

    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,

    @InjectRepository(ResourceSchedule)
    private readonly scheduleRepository: Repository<ResourceSchedule>,

    private readonly auditService: AuditService,

    private readonly notificationsService: NotificationsService,

    private readonly dataSource: DataSource,
  ) { }

  async create(userId: string, dto: CreateReservationDto) {
    // Envolvemos TODO en una transacción ACID
    return this.dataSource.transaction(async (manager) => {

      // BLOQUEO PESIMISTA: Si dos personas intentan reservar ESTE recurso al mismo tiempo,
      // la base de datos hará que el segundo espere a que el primero termine.
      const resource = await manager.findOne(Resource, {
        where: { id: dto.resourceId, isActive: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!resource) {
        throw new NotFoundException('Recurso no encontrado o inactivo.');
      }

      const now = guatemalaNow();

      if (dto.reservationDate < now.date) {
        throw new BadRequestException('No puedes reservar en una fecha pasada.');
      }

      if (dto.reservationDate === now.date && dto.startTime) {
        if (hhmmToMinutes(dto.startTime) < now.minutes) {
          throw new BadRequestException('La hora de inicio ya pasó el dia de hoy.');
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
          exceptionDate: dto.reservationDate as any,
        },
      });
      if (exception) {
        throw new BadRequestException(
          `El recurso no está disponible esa fecha: ${exception.reason}.`,
        );
      }

      // ¿Existe un horario activo para ese dia de la semana?
      const dayOfWeek = dayOfWeekFromISODate(dto.reservationDate);
      const schedule = await manager.findOne(ResourceSchedule, {
        where: {
          resourceId: dto.resourceId,
          dayOfWeek,
          isActive: true,
        },
      });
      if (!schedule) {
        throw new BadRequestException('El recurso no atiende ese dia.');
      }

      if (resource.type === ResourceType.COURT) {
        if (!dto.startTime || !dto.endTime) {
          throw new BadRequestException('Para canchas debes especificar hora de inicio y fin.');
        }

        const start = new Date(`1970-01-01T${dto.startTime}:00Z`).getTime();
        const end = new Date(`1970-01-01T${dto.endTime}:00Z`).getTime();
        if (start >= end) {
          throw new BadRequestException('La hora de inicio debe ser estrictamente anterior a la hora de fin.');
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

        const existingCourtReservation = await manager
          .createQueryBuilder(Reservation, 'r')
          .innerJoin('r.resource', 'res')
          .where('r.userId = :userId', { userId })
          .andWhere('r.reservationDate = :date', { date: dto.reservationDate })
          .andWhere('res.type = :type', { type: ResourceType.COURT })
          .andWhere('r.status NOT IN (:...statuses)', {
            statuses: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED, ReservationStatus.REJECTED],
          })
          .getOne();

        if (existingCourtReservation) {
          throw new BadRequestException('Ya tienes una reserva de cancha para ese día.');
        }

        const conflictingReservation = await manager
          .createQueryBuilder(Reservation, 'r')
          .where('r.resourceId = :resourceId', { resourceId: dto.resourceId })
          .andWhere('r.reservationDate = :date', { date: dto.reservationDate })
          .andWhere('r.startTime < :endTime', { endTime: dto.endTime })
          .andWhere('r.endTime > :startTime', { startTime: dto.startTime })
          .andWhere('r.status NOT IN (:...statuses)', {
            statuses: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED, ReservationStatus.REJECTED],
          })
          .getOne();

        if (conflictingReservation) {
          throw new BadRequestException('Ese horario ya está ocupado. Por favor elige otro.');
        }
      }

      if (resource.type === ResourceType.RANCH) {
        const existingRanchReservation = await manager.findOne(Reservation, {
          where: {
            resourceId: dto.resourceId,
            reservationDate: dto.reservationDate,
            status: Not(In([ReservationStatus.CANCELLED, ReservationStatus.EXPIRED, ReservationStatus.REJECTED])),
          },
        });

        if (existingRanchReservation) {
          throw new BadRequestException('Este rancho ya está reservado para esa fecha.');
        }
      }

      let paymentDeadline: Date | null = null;
      if (resource.type === ResourceType.COURT) {
        paymentDeadline = new Date();
        paymentDeadline.setHours(paymentDeadline.getHours() + 24);
      }

      const reservation = manager.create(Reservation, {
        userId,
        resourceId: dto.resourceId,
        reservationDate: dto.reservationDate,
        startTime: dto.startTime ?? null,
        endTime: dto.endTime ?? null,
        status: ReservationStatus.PENDING_PAYMENT,
        paymentDeadline,
      });

      const saved = await manager.save(reservation);

      const log = new ReservationLog();
      log.reservationId = saved.id;
      log.fromStatus = null;
      log.toStatus = ReservationStatus.PENDING_PAYMENT;
      log.changedById = userId;
      log.reason = 'Reserva creada';

      await manager.save(log); // Si esto falla, NADA se guarda gracias a la transacción.

      return saved;
    });
  }

  // El ciudadano ve sus propias reservas
  async findMyReservations(userId: string) {
    return this.reservationRepository.find({
      where: { userId },
      relations: ['resource'],
      order: { createdAt: 'DESC' },
    });
  }

  // Admin y operador ven todas las reservas
  async findAll(status?: ReservationStatus, page: number = 1, limit: number = 10) {
    const query = this.reservationRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.resource', 'resource')
      .leftJoinAndSelect('r.user', 'user')
      .orderBy('r.createdAt', 'DESC');

    if (status) {
      query.where('r.status = :status', { status });
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
      }
    };
  }

  // Ver detalle de una reserva
  async findOne(id: string, userId: string, userRole: Role) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
      relations: ['resource', 'user'],
    });

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }

    // El ciudadano solo puede ver sus propias reservas
    if (userRole === Role.CITIZEN && reservation.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para ver esta reserva.');
    }

    return reservation;
  }

  // Admin u operador cambia el estado de una reserva
  async updateStatus(
    id: string,
    dto: UpdateReservationStatusDto,
    changedById: string,
    ipAddress?: string,
  ) {
    const { reservation, fromStatus } = await this.dataSource.transaction(
      async (manager) => {
        const found = await manager.findOne(Reservation, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!found) {
          throw new NotFoundException('Reserva no encontrada.');
        }

        const fromStatus = found.status;

        // 1. Validar la transición contra la máquina de estados.
        const allowed = this.allowedTransitions[fromStatus] ?? [];
        if (!allowed.includes(dto.status)) {
          throw new BadRequestException(
            `Transición inválida: no se puede pasar una reserva de "${fromStatus}" a "${dto.status}".`,
          );
        }

        // 2. Aprobar exige un pago registrado.
        if (dto.status === ReservationStatus.APPROVED) {
          const payment = await manager.findOne(Payment, {
            where: { reservationId: id },
          });
          if (!payment) {
            throw new BadRequestException(
              'No se puede aprobar una reserva sin un pago registrado.',
            );
          }
        }

        // 3. Aplicar el cambio.
        found.status = dto.status;
        if (dto.status === ReservationStatus.APPROVED) {
          found.confirmedAt = new Date();
        }
        if (dto.status === ReservationStatus.REJECTED) {
          found.rejectionReason = dto.reason;
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

  // El ciudadano cancela su propia reserva
  async cancel(id: string, userId: string) {
    const reservation = await this.reservationRepository.findOne({
      where: { id, userId },
    });

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }

    if (
      [
        ReservationStatus.APPROVED,
        ReservationStatus.CANCELLED,
        ReservationStatus.EXPIRED,
        ReservationStatus.REJECTED,
      ].includes(reservation.status)
    ) {
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

    return { message: 'Reserva cancelada correctamente.' };
  }

  // Job que expira reservas con payment_deadline vencido
  @Cron(CronExpression.EVERY_5_MINUTES)
  async expireOverdueReservations() {
    const result = await this.reservationRepository
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

    const expiredIds: string[] = result.raw.map((r: { id: string }) => r.id);

    if (expiredIds.length === 0) {
      return 0;
    }

    // Dejar rastro en el LOG para cada reserva expirada
    const logs = expiredIds.map((id) => {
      const log = new ReservationLog();
      log.reservationId = id;
      log.fromStatus = ReservationStatus.PENDING_PAYMENT;
      log.toStatus = ReservationStatus.EXPIRED;
      log.changedById = null;
      log.reason = 'Expirada automaticamente por vencimiento de plazo de pago'
      return log;
    });

    await this.logRepository.save(logs);

    return expiredIds.length;
  }

}
