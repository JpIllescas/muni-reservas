import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
  ) {}

  async create(userId: string, dto: CreateReservationDto) {
    const resource = await this.resourceRepository.findOne({
      where: { id: dto.resourceId, isActive: true },
    });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado o inactivo.');
    }

    const reservationDate = new Date(dto.reservationDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Verificar que la fecha no sea en el pasado
    if (reservationDate < today) {
      throw new BadRequestException('No puedes reservar en una fecha pasada.');
    }

    // Verificar ventana de reserva (máximo advanceDays días hacia adelante)
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + resource.advanceDays);
    maxDate.setHours(23, 59, 59, 999);

    if (reservationDate > maxDate) {
      throw new BadRequestException(
        `Solo puedes reservar con un máximo de ${resource.advanceDays} días de anticipación.`,
      );
    }

    if (resource.type === ResourceType.COURT) {
      // Validaciones específicas para canchas
      if (!dto.startTime || !dto.endTime) {
        throw new BadRequestException('Para canchas debes especificar hora de inicio y fin.');
      }

      // Validar que el tiempo de inicio sea menor al tiempo de fin (ej. no dejar 18:00 a 10:00)
      const start = new Date(`1970-01-01T${dto.startTime}:00Z`).getTime();
      const end = new Date(`1970-01-01T${dto.endTime}:00Z`).getTime();
      if (start >= end) {
        throw new BadRequestException('la hora de inciio debe ser estrictamente anterior a la hora de fin.');
      }

      // Verificar que el usuario no tenga ya una reserva activa ese día en cualquier cancha
      const existingCourtReservation = await this.reservationRepository
        .createQueryBuilder('r')
        .innerJoin('r.resource', 'res')
        .where('r.userId = :userId', { userId })
        .andWhere('r.reservationDate = :date', { date: dto.reservationDate })
        .andWhere('res.type = :type', { type: ResourceType.COURT })
        .andWhere('r.status NOT IN (:...statuses)', {
          statuses: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED, ReservationStatus.REJECTED],
        })
        .getOne();

      if (existingCourtReservation) {
        throw new BadRequestException(
          'Ya tienes una reserva de cancha para ese día.',
        );
      }

      // Verificar que el horario solicitado no esté ocupado
      const conflictingReservation = await this.reservationRepository
        .createQueryBuilder('r')
        .where('r.resourceId = :resourceId', { resourceId: dto.resourceId })
        .andWhere('r.reservationDate = :date', { date: dto.reservationDate })
        .andWhere('r.startTime < :endTime', { endTime: dto.endTime })
        .andWhere('r.endTime > :startTime', { startTime: dto.startTime })
        .andWhere('r.status NOT IN (:...statuses)', {
          statuses: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED, ReservationStatus.REJECTED],
        })
        .getOne();

      if (conflictingReservation) {
        throw new BadRequestException(
          'Ese horario ya está ocupado. Por favor elige otro.',
        );
      }
    }

    if (resource.type === ResourceType.RANCH) {
      // Verificar que el rancho no esté ya reservado ese día
      const existingRanchReservation = await this.reservationRepository.findOne({
        where: {
          resourceId: dto.resourceId,
          reservationDate: dto.reservationDate,
        },
      });

      if (existingRanchReservation &&
        ![ReservationStatus.CANCELLED, ReservationStatus.EXPIRED, ReservationStatus.REJECTED]
          .includes(existingRanchReservation.status)) {
        throw new BadRequestException(
          'Este rancho ya está reservado para esa fecha.',
        );
      }
    }

    // Calcular payment_deadline
    // En canchas: 24 horas desde ahora
    // En ranchos: null porque pagan el día que llegan
    let paymentDeadline: Date | null = null;

    if (resource.type === ResourceType.COURT) {
      paymentDeadline = new Date();
      paymentDeadline.setHours(paymentDeadline.getHours() + 24);
    }

    const reservation = this.reservationRepository.create({
      userId,
      resourceId: dto.resourceId,
      reservationDate: dto.reservationDate,
      startTime: dto.startTime ?? null,
      endTime: dto.endTime ?? null,
      status: ReservationStatus.PENDING_PAYMENT,
      paymentDeadline,
    });

    const saved = await this.reservationRepository.save(reservation);

    // Registrar en el log
    const log = new ReservationLog();
    log.reservationId = saved.id;
    log.fromStatus = null;
    log.toStatus = ReservationStatus.PENDING_PAYMENT;
    log.changedById = userId;
    log.reason = 'Reserva creada';
    await this.logRepository.save(log);

    return saved;
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
      relations: ['user', 'resource']
    });

    if (reservationWithUser && reservationWithUser.user) {
      await this.notificationsService.sendReservationStatusEmail(
        reservationWithUser.user,
        reservationWithUser,
        dto.status,
        dto.reason
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

    if ([ReservationStatus.APPROVED, ReservationStatus.CANCELLED,
         ReservationStatus.EXPIRED, ReservationStatus.REJECTED]
        .includes(reservation.status)) {
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
      .where('r.status = :status', { status: ReservationStatus.PENDING_PAYMENT })
      .andWhere('r.paymentDeadline IS NOT NULL')
      .andWhere('r.paymentDeadline < :now', { now: new Date() })
      .getMany();

    for (const reservation of overdueReservations) {
      reservation.status = ReservationStatus.EXPIRED;
      await this.reservationRepository.save(reservation);

      const log = new ReservationLog();
      log.reservationId = reservation.id;
      log.fromStatus = ReservationStatus.PENDING_PAYMENT;
      log.toStatus = ReservationStatus.EXPIRED;
      log.changedById = null;
      log.reason = 'Expirada automáticamente por vencimiento de plazo de pago';
      await this.logRepository.save(log);
    }

    return overdueReservations.length;
  }
}