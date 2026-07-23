import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, In, Between } from 'typeorm';
import { Resource } from './entities/resource.entity';
import { Sede } from './entities/sede.entity';
import { ResourceSchedule } from './entities/resource-schedule.entity';
import { ResourceException } from './entities/resource-exception.entity';
import { ResourceScheduleOverride } from './entities/resource-schedule-override.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { CreateScheduleOverrideDto } from './dto/create-schedule-override.dto';
import { UpdateResourceStatusDto } from './dto/update-resource-status.dto';
import { AuditService } from '../audit/audit.service';
import { ResourceStatusesService } from '../resource-statuses/resource-statuses.service';
import { ResourceType } from '../../common/enums/resource-type.enum';
import { INACTIVE_RESERVATION_STATUSES } from '../../common/enums/reservation-status.enum';
import {
  guatemalaNow,
  hhmmToMinutes,
  addDaysToISODate,
  dayOfWeekFromISODate,
} from '../../common/utils/date.utils';
import { resolveEffectiveSchedule } from './utils/schedule-resolver.util';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertSedeAccess } from '../../common/utils/sede-scope.util';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,

    @InjectRepository(Sede)
    private readonly sedeRepository: Repository<Sede>,

    @InjectRepository(ResourceSchedule)
    private readonly scheduleRepository: Repository<ResourceSchedule>,

    @InjectRepository(ResourceException)
    private readonly exceptionRepository: Repository<ResourceException>,

    @InjectRepository(ResourceScheduleOverride)
    private readonly overrideRepository: Repository<ResourceScheduleOverride>,

    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,

    private readonly auditService: AuditService,
    private readonly resourceStatusesService: ResourceStatusesService,
  ) { }

  // Crear un nuevo recurso (cancha o rancho)
  async create(dto: CreateResourceDto, user: AuthUser, ipAddress?: string) {
    // el admin solo crea en sus sedes; el super-admin en cualquiera.
    assertSedeAccess(user, dto.sedeId);

    // La sede debe existir (el FK lo impediría igual, pero damos error claro).
    const sede = await this.sedeRepository.findOne({
      where: { id: dto.sedeId },
    });
    if (!sede) {
      throw new BadRequestException('La sede indicada no existe.');
    }

    const resource = this.resourceRepository.create(dto);
    const saved = await this.resourceRepository.save(resource);

    await this.auditService.createLog(
      'Resource',
      'CREATE',
      user.id,
      saved.id,
      undefined,
      { ...dto },
      ipAddress,
    );

    return saved;
  }

  // Obtener todos los recursos activos — para el catálogo ciudadano.
  // Gate de sede: los recursos de una sede inactiva desaparecen del catálogo
  // SIN tocar su isActive (al reactivar la sede vuelven solos, sin cascada).
  async findAll() {
    const resources = await this.resourceRepository.find({
      where: { isActive: true, sede: { isActive: true } },
      order: { name: 'ASC' },
    });
    return this.attachStatusCatalog(resources);
  }

  // Enriquece los recursos con la etiqueta y el flag de bloqueo de su estado
  private async attachStatusCatalog<T extends { status: string }>(
    resources: T[],
  ): Promise<(T & { statusLabel: string; statusBlocksReservations: boolean })[]> {
    const catalog = await this.resourceStatusesService.findAll(true);
    const byKey = new Map(catalog.map((s) => [s.key, s]));
    return resources.map((r) => {
      const s = byKey.get(r.status);
      return {
        ...r,
        statusLabel: s?.label ?? r.status,
        statusBlocksReservations: s?.blocksReservations ?? false,
      };
    });
  }

  // Obtener los recursos (incluye inactivos) de las sedes del actor — panel admin.
  // El super-admin ve todos; el resto solo los de sus sedes. Fail-closed.
  async findAllAdmin(user: AuthUser) {
    if (user.isSuperAdmin) {
      return this.resourceRepository.find({ order: { name: 'ASC' } });
    }
    if (user.sedeIds.length === 0) {
      return [];
    }
    return this.resourceRepository.find({
      where: { sedeId: In(user.sedeIds) },
      order: { name: 'ASC' },
    });
  }

  // Obtener un recurso por id con sus horarios
  async findOne(id: string) {
    const resource = await this.resourceRepository.findOne({
      where: { id },
    });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    const schedules = await this.scheduleRepository.find({
      where: { resourceId: id, isActive: true },
      order: { dayOfWeek: 'ASC' },
    });

    // resolver etiqueta y flag de bloqueo del estado para la vista pública.
    const statusRow = await this.resourceStatusesService.findByKeyOrNull(
      resource.status,
    );

    return {
      ...resource,
      schedules,
      statusLabel: statusRow?.label ?? resource.status,
      statusBlocksReservations: statusRow?.blocksReservations ?? false,
    };
  }

  // Disponibilidad de un recurso en una fecha concreta.
  async getAvailability(resourceId: string, date: string) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId, isActive: true },
      relations: ['sede'],
    });

    // Gate de sede: sede inactiva = recurso invisible (mismo mensaje que un recurso inactivo para no filtrar información).
    if (!resource || !resource.sede.isActive) {
      throw new NotFoundException('Recurso no encontrado o inactivo.');
    }

    // ¿La fecha cae en una excepción (feriado / mantenimiento)?
    const exception = await this.exceptionRepository.findOne({
      where: { resourceId, exceptionDate: date },
    });

    // Horario EFECTIVO del día: override por fecha > semanal. Si la fecha está bloqueada (excepción, REC-1) ni se resuelve: el bloqueo gana.
    const schedule = exception
      ? null
      : await resolveEffectiveSchedule(
        this.scheduleRepository.manager,
        resourceId,
        date,
      );

    // Reservas vivas de ese recurso/fecha (las mismas que ocupan el slot en create()).
    const reservations = await this.reservationRepository.find({
      where: {
        resourceId,
        reservationDate: date,
        status: Not(In(INACTIVE_RESERVATION_STATUSES)),
      },
      order: { startTime: 'ASC' },
    });

    // estado operativo (catálogo) cierra el recurso aunque siga activo y con horario. El bloqueo cuelga del flag blocksReservations, no del nombre.
    const statusRow = await this.resourceStatusesService.findByKeyOrNull(
      resource.status,
    );
    const inMaintenance = statusRow?.blocksReservations ?? false;
    const statusLabel = statusRow?.label ?? resource.status;

    // Cerrado: estado operativo, excepción de fecha, o el recurso no atiende ese día.
    const closed = inMaintenance || !!exception || !schedule;

    // Prioridad del motivo: excepción puntual > estado operativo del recurso.
    const reason = exception
      ? exception.reason
      : inMaintenance
        ? (resource.statusReason ?? `Recurso en ${statusLabel}.`)
        : null;

    const base = {
      resourceId,
      date,
      type: resource.type,
      closed,
      status: resource.status,
      statusLabel,
      reason,
    };

    // Rancho: día completo. Solo interesa si el día está libre o tomado.
    if (resource.type === ResourceType.RANCH) {
      return {
        ...base,
        available: !closed && reservations.length === 0,
      };
    }

    // Cancha: el front necesita la ventana, el granulado, el tope y lo ocupado.
    return {
      ...base,
      maxDurationMinutes: resource.maxDurationMinutes,
      schedule: schedule
        ? {
          openTime: schedule.openTime,
          closeTime: schedule.closeTime,
          slotDurationMin: schedule.slotDurationMin,
        }
        : null,
      occupied: reservations.map((r) => ({
        startTime: r.startTime,
        endTime: r.endTime,
      })),
    };
  }

  // Disponibilidad por RANGO de fechas (para pintar el calendario mes/semana).
  async getAvailabilityRange(resourceId: string, from: string, to: string) {
    if (from > to) {
      throw new BadRequestException('from debe ser anterior o igual a to.');
    }
    if (addDaysToISODate(from, 62) < to) {
      throw new BadRequestException('El rango máximo es de 62 días.');
    }

    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId, isActive: true },
      relations: ['sede'],
    });
    if (!resource || !resource.sede.isActive) {
      throw new NotFoundException('Recurso no encontrado o inactivo.');
    }

    const [exceptions, overrides, schedules, reservations] = await Promise.all([
      this.exceptionRepository.find({
        where: { resourceId, exceptionDate: Between(from, to) },
      }),
      this.overrideRepository.find({
        where: { resourceId, overrideDate: Between(from, to) },
      }),
      this.scheduleRepository.find({ where: { resourceId, isActive: true } }),
      this.reservationRepository.find({
        where: {
          resourceId,
          reservationDate: Between(from, to),
          status: Not(In(INACTIVE_RESERVATION_STATUSES)),
        },
        select: ['id', 'reservationDate'],
      }),
    ]);

    const exceptionByDate = new Map(
      exceptions.map((e) => [e.exceptionDate, e.reason]),
    );
    const overrideDates = new Set(overrides.map((o) => o.overrideDate));
    const openWeekdays = new Set(schedules.map((s) => s.dayOfWeek));
    const reservedCount = new Map<string, number>();
    for (const r of reservations) {
      reservedCount.set(
        r.reservationDate,
        (reservedCount.get(r.reservationDate) ?? 0) + 1,
      );
    }

    const statusRow = await this.resourceStatusesService.findByKeyOrNull(
      resource.status,
    );
    const statusClosed = statusRow?.blocksReservations ?? false;
    const statusReason = statusClosed
      ? (resource.statusReason ??
        `Recurso en ${statusRow?.label ?? resource.status}.`)
      : null;

    const days: {
      date: string;
      closed: boolean;
      reason: string | null;
      booked: boolean;
    }[] = [];
    for (let date = from; date <= to; date = addDaysToISODate(date, 1)) {
      let closed = false;
      let reason: string | null = null;

      if (statusClosed) {
        closed = true;
        reason = statusReason;
      } else if (exceptionByDate.has(date)) {
        closed = true;
        reason = exceptionByDate.get(date) ?? 'Fecha bloqueada';
      } else if (
        !overrideDates.has(date) &&
        !openWeekdays.has(dayOfWeekFromISODate(date))
      ) {
        closed = true;
        reason = 'No atiende este día';
      }

      // Rancho: una sola reserva por día → el día reservado cierra completo.
      const booked = (reservedCount.get(date) ?? 0) > 0;
      if (!closed && booked && resource.type === ResourceType.RANCH) {
        closed = true;
        reason = 'Ya está reservado';
      }

      days.push({ date, closed, reason, booked });
    }

    return { resourceId, type: resource.type, from, to, days };
  }

  // Actualizar un recurso
  async update(
    id: string,
    dto: UpdateResourceDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const resource = await this.findOne(id);

    // solo recursos de las sedes del actor.
    assertSedeAccess(user, resource.sedeId);

    // snapshot del estado anterior
    const { schedules, ...oldValue } = resource;

    Object.assign(resource, dto);
    const saved = await this.resourceRepository.save(resource);

    await this.auditService.createLog(
      'Resource',
      'UPDATE',
      user.id,
      id,
      oldValue,
      { ...dto },
      ipAddress,
    );

    return saved;
  }

  // Activar o desactivar un recurso
  async toggleActive(id: string, user: AuthUser, ipAddress?: string) {
    const resource = await this.resourceRepository.findOne({ where: { id } });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    // solo recursos de las sedes del actor.
    assertSedeAccess(user, resource.sedeId);

    const oldValue = resource.isActive;
    resource.isActive = !resource.isActive;
    await this.resourceRepository.save(resource);

    await this.auditService.createLog(
      'Resource',
      'TOGGLE_ACTIVE',
      user.id,
      id,
      { isActive: oldValue },
      { isActive: resource.isActive },
      ipAddress,
    );

    return {
      message: `Recurso ${resource.isActive ? 'activado' : 'desactivado'} correctamente.`,
    };
  }

  // Agregar un horario a un recurso
  async addSchedule(
    resourceId: string,
    dto: CreateScheduleDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    // solo recursos de las sedes del actor.
    assertSedeAccess(user, resource.sedeId);

    const schedule = this.scheduleRepository.create({
      ...dto,
      resourceId,
    });
    const saved = await this.scheduleRepository.save(schedule);

    await this.auditService.createLog(
      'ResourceSchedule',
      'ADD_SCHEDULE',
      user.id,
      saved.id,
      undefined,
      { ...dto, resourceId },
      ipAddress,
    );

    return saved;
  }

  // Obtener los horarios de un recurso
  async getSchedules(resourceId: string) {
    return this.scheduleRepository.find({
      where: { resourceId, isActive: true },
      order: { dayOfWeek: 'ASC' },
    });
  }

  // Desactivar un horario
  async removeSchedule(scheduleId: string, user: AuthUser, ipAddress?: string) {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Horario no encontrado.');
    }

    // el horario pertenece a un recurso → acotar por su sede.
    const resource = await this.resourceRepository.findOne({
      where: { id: schedule.resourceId },
    });
    assertSedeAccess(user, resource!.sedeId);

    schedule.isActive = false;
    await this.scheduleRepository.save(schedule);

    await this.auditService.createLog(
      'ResourceSchedule',
      'REMOVE_SCHEDULE',
      user.id,
      scheduleId,
      { isActive: true },
      { isActive: false },
      ipAddress,
    );
    return { message: 'Horario eliminado correctamente.' };
  }

  // Bloquear una fecha de un recurso (feriado / mantenimiento puntual).
  async addException(
    resourceId: string,
    dto: CreateExceptionDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    // solo recursos de las sedes del actor.
    assertSedeAccess(user, resource.sedeId);

    // No se bloquean fechas en el pasado (comparación por string YYYY-MM-DD).
    if (dto.exceptionDate < guatemalaNow().date) {
      throw new BadRequestException(
        'No se puede bloquear una fecha que ya pasó.',
      );
    }

    // Una sola excepción por recurso/fecha (no hay unique en BD: se valida acá).
    const existing = await this.exceptionRepository.findOne({
      where: { resourceId, exceptionDate: dto.exceptionDate },
    });
    if (existing) {
      throw new BadRequestException('Esa fecha ya está bloqueada.');
    }

    // No bloquear si hay reservas vivas ese día: el bloqueo NO las cancela y solo afecta reservas nuevas. El admin debe resolverlas primero.
    const liveReservations = await this.reservationRepository.count({
      where: {
        resourceId,
        reservationDate: dto.exceptionDate,
        status: Not(In(INACTIVE_RESERVATION_STATUSES)),
      },
    });
    if (liveReservations > 0) {
      throw new BadRequestException(
        `No se puede bloquear: la fecha tiene ${liveReservations} reserva(s) activa(s). Resuélvelas primero.`,
      );
    }

    const exception = this.exceptionRepository.create({
      resourceId,
      exceptionDate: dto.exceptionDate,
      reason: dto.reason,
      createdById: user.id,
    });
    const saved = await this.exceptionRepository.save(exception);

    await this.auditService.createLog(
      'ResourceException',
      'CREATE',
      user.id,
      saved.id,
      undefined,
      { ...dto, resourceId },
      ipAddress,
    );

    return saved;
  }

  // Listar las fechas bloqueadas de un recurso (panel admin).
  async getExceptions(resourceId: string, user: AuthUser) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    // solo recursos de las sedes del actor.
    assertSedeAccess(user, resource.sedeId);

    return this.exceptionRepository.find({
      where: { resourceId },
      order: { exceptionDate: 'ASC' },
    });
  }

  // Desbloquear una fecha (hard delete; el audit log guarda el valor previo).
  async removeException(
    exceptionId: string,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const exception = await this.exceptionRepository.findOne({
      where: { id: exceptionId },
    });

    if (!exception) {
      throw new NotFoundException('Fecha bloqueada no encontrada.');
    }

    // la excepción pertenece a un recurso → acotar por su sede.
    const resource = await this.resourceRepository.findOne({
      where: { id: exception.resourceId },
    });
    assertSedeAccess(user, resource!.sedeId);

    await this.exceptionRepository.remove(exception);

    await this.auditService.createLog(
      'ResourceException',
      'DELETE',
      user.id,
      exceptionId,
      {
        resourceId: exception.resourceId,
        exceptionDate: exception.exceptionDate,
        reason: exception.reason,
      },
      undefined,
      ipAddress,
    );

    return { message: 'Fecha desbloqueada correctamente.' };
  }

  // reservas vivas de un recurso en una fecha (asignación ante imprevistos). Es el paso previo a bloquear la fecha addException rechaza mientras haya reservas activas ese día, y este listado se las muestra al admin
  async getAffectedReservations(
    resourceId: string,
    date: string,
    user: AuthUser,
  ) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    // solo recursos de las sedes del actor.
    assertSedeAccess(user, resource.sedeId);

    return this.reservationRepository.find({
      where: {
        resourceId,
        reservationDate: date,
        status: Not(In(INACTIVE_RESERVATION_STATUSES)),
      },
      relations: ['user'],
      order: { startTime: 'ASC' },
    });
  }

  // crear un horario especial (override) para una fecha concreta.
  async addScheduleOverride(
    resourceId: string,
    dto: CreateScheduleOverrideDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    // solo recursos de las sedes del actor.
    assertSedeAccess(user, resource.sedeId);

    // No se define un horario especial para una fecha pasada.
    if (dto.overrideDate < guatemalaNow().date) {
      throw new BadRequestException(
        'No se puede definir un horario para una fecha que ya pasó.',
      );
    }

    // La ventana debe ser válida (inicio estrictamente antes del fin).
    if (hhmmToMinutes(dto.openTime) >= hhmmToMinutes(dto.closeTime)) {
      throw new BadRequestException(
        'La hora de apertura debe ser anterior a la de cierre.',
      );
    }

    // Un solo override por recurso/fecha (no hay unique en BD: se valida acá).
    const existing = await this.overrideRepository.findOne({
      where: { resourceId, overrideDate: dto.overrideDate },
    });
    if (existing) {
      throw new BadRequestException(
        'Esa fecha ya tiene un horario especial definido.',
      );
    }

    const override = this.overrideRepository.create({
      resourceId,
      overrideDate: dto.overrideDate,
      openTime: dto.openTime,
      closeTime: dto.closeTime,
      slotDurationMin: dto.slotDurationMin ?? null,
      createdById: user.id,
    });
    const saved = await this.overrideRepository.save(override);

    await this.auditService.createLog(
      'ResourceScheduleOverride',
      'CREATE',
      user.id,
      saved.id,
      undefined,
      { ...dto, resourceId },
      ipAddress,
    );

    return saved;
  }

  // Listar los horarios especiales de un recurso (panel admin).
  async getScheduleOverrides(resourceId: string, user: AuthUser) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    // solo recursos de las sedes del actor.
    assertSedeAccess(user, resource.sedeId);

    return this.overrideRepository.find({
      where: { resourceId },
      order: { overrideDate: 'ASC' },
    });
  }

  // Eliminar un horario especial (hard delete; el audit log guarda el valor previo).
  async removeScheduleOverride(
    overrideId: string,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const override = await this.overrideRepository.findOne({
      where: { id: overrideId },
    });

    if (!override) {
      throw new NotFoundException('Horario especial no encontrado.');
    }

    // el override pertenece a un recurso → acotar por su sede.
    const resource = await this.resourceRepository.findOne({
      where: { id: override.resourceId },
    });
    assertSedeAccess(user, resource!.sedeId);

    await this.overrideRepository.remove(override);

    await this.auditService.createLog(
      'ResourceScheduleOverride',
      'DELETE',
      user.id,
      overrideId,
      {
        resourceId: override.resourceId,
        overrideDate: override.overrideDate,
        openTime: override.openTime,
        closeTime: override.closeTime,
      },
      undefined,
      ipAddress,
    );

    return { message: 'Horario especial eliminado correctamente.' };
  }

  // cambiar el estado operativo del recurso (available / maintenance / event). 
  async updateStatus(
    id: string,
    dto: UpdateResourceStatusDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const resource = await this.resourceRepository.findOne({ where: { id } });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    // solo recursos de las sedes del actor.
    assertSedeAccess(user, resource.sedeId);

    // El estado debe existir en el catálogo y estar activo.
    const statusRow = await this.resourceStatusesService.findActiveByKey(
      dto.status,
    );

    const oldValue = {
      status: resource.status,
      statusReason: resource.statusReason,
    };

    resource.status = statusRow.key;
    // El motivo solo aplica a estados que bloquean reservas; en un estado que no
    // bloquea (ej. 'available') se limpia.
    resource.statusReason = statusRow.blocksReservations
      ? (dto.statusReason ?? null)
      : null;

    const saved = await this.resourceRepository.save(resource);

    await this.auditService.createLog(
      'Resource',
      'UPDATE_STATUS',
      user.id,
      id,
      oldValue,
      { status: saved.status, statusReason: saved.statusReason },
      ipAddress,
    );

    return saved;
  }
}
