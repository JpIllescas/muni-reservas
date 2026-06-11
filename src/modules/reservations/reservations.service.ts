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
import { ResourceSchedule } from '../resources/entities/resource-schedule.entity';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { ReservationStatus } from '../../common/enums/reservation-status.enum';
import { ResourceType } from '../../common/enums/resource-type.enum';
import { Role } from '../../common/enums/role.enum';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ReservationsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,

    @InjectRepository(ReservationLog)
    private readonly logRepository: Repository<ReservationLog>,

    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,

    @InjectRepository(ResourceSchedule)
    private readonly scheduleRepository: Repository<ResourceSchedule>,

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

      const [year, month, day] = dto.reservationDate.split('-');
      const reservationDate = new Date(Number(year), Number(month) - 1, Number(day));
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (reservationDate < today) {
        throw new BadRequestException('No puedes reservar en una fecha pasada.');
      }

      if (dto.reservationDate === new Date().toISOString().split('T')[0] && dto.startTime) {
        const currentTime = new Date().toTimeString().substring(0, 5);
        if (dto.startTime < currentTime) {
          throw new BadRequestException('La hora de inicio ya pasó el dia de hoy.');
        }
      }

      const maxDate = new Date();
      maxDate.setDate(maxDate.getDate() + resource.advanceDays);
      maxDate.setHours(23, 59, 59, 999);

      if (reservationDate > maxDate) {
        throw new BadRequestException(
          `Solo puedes reservar con un máximo de ${resource.advanceDays} días de anticipación.`,
        );
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
  async findAll(status?: ReservationStatus) {
    const query = this.reservationRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.resource', 'resource')
      .leftJoinAndSelect('r.user', 'user')
      .orderBy('r.createdAt', 'DESC');

    if (status) {
      query.where('r.status = :status', { status });
    }

    return query.getMany();
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
  ) {
    const reservation = await this.reservationRepository.findOne({
      where: { id },
    });

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }

    const fromStatus = reservation.status;
    reservation.status = dto.status;

    if (dto.status === ReservationStatus.APPROVED) {
      reservation.confirmedAt = new Date();
    }

    if (dto.status === ReservationStatus.REJECTED) {
      reservation.rejectionReason = dto.reason;
    }

    await this.reservationRepository.save(reservation);

    // Registrar el cambio en el log
    const log = new ReservationLog();
    log.reservationId = id;
    log.fromStatus = fromStatus;
    log.toStatus = dto.status;
    log.changedById = changedById;
    log.reason = dto.reason ?? null;
    await this.logRepository.save(log);
    const reservationWithUser = await this.reservationRepository.findOne({
      where: { id },
      relations: ['user', 'resource'],
    });

    if (reservationWithUser && reservationWithUser.user) {
      await this.notificationsService.sendReservationStatusEmail(
        reservationWithUser.user,
        reservationWithUser,
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
    const overdueReservations = await this.reservationRepository
      .createQueryBuilder('r')
      .where('r.status = :status', {
        status: ReservationStatus.PENDING_PAYMENT,
      })
      .andWhere('r.paymentDeadline IS NOT NULL')
      .andWhere('r.paymentDeadline < :now', { now: new Date() })
      .getMany();

    if (overdueReservations.length === 0) {
      return 0;
    }

    // Obtener solo los IDs
    const reservationIds = overdueReservations.map(r => r.id);

    // 1. una sola consulta
    await this.reservationRepository
      .createQueryBuilder()
      .update(Reservation)
      .set({ status: ReservationStatus.EXPIRED })
      .whereInIds(reservationIds)
      .execute();

    // 2. Creacion de LOGS 
    const logs = reservationIds.map((id) => {
      const log = new ReservationLog();
      log.reservationId = id;
      log.fromStatus = ReservationStatus.PENDING_PAYMENT;
      log.toStatus = ReservationStatus.EXPIRED;
      log.changedById = null;
      log.reason = 'Expirada automáticamente por vencimiento de plazo de pago';
      return log;
    });

    await this.logRepository.save(logs);

    return reservationIds.length;
  }
}
