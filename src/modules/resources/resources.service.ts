import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Resource } from './entities/resource.entity';
import { ResourceSchedule } from './entities/resource-schedule.entity';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,

    @InjectRepository(ResourceSchedule)
    private readonly scheduleRepository: Repository<ResourceSchedule>,

    private readonly auditService: AuditService,
  ) { }

  // Crear un nuevo recurso (cancha o rancho)
  async create(dto: CreateResourceDto, performedById: string, ipAddress?: string) {
    const resource = this.resourceRepository.create(dto);
    const saved = await this.resourceRepository.save(resource);

    await this.auditService.createLog(
      'Resource',
      'CREATE',
      performedById,
      saved.id,
      undefined,
      { ...dto },
      ipAddress,
    );

    return saved;
  }

  // Obtener todos los recursos activos — para el catálogo ciudadano
  async findAll() {
    return this.resourceRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  // Obtener todos los recursos incluyendo inactivos — para el panel admin
  async findAllAdmin() {
    return this.resourceRepository.find({
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

    return { ...resource, schedules };
  }

  // Actualizar un recurso
  async update(
    id: string,
    dto: UpdateResourceDto,
    performedById: string,
    ipAddress?: string,
  ) {
    const resource = await this.findOne(id);

    // snapshot del estado anterior
    const { schedules, ...oldValue } = resource;

    Object.assign(resource, dto);
    const saved = await this.resourceRepository.save(resource);

    await this.auditService.createLog(
      'Resource',
      'UPDATE',
      performedById,
      id,
      oldValue,
      { ...dto },
      ipAddress,
    );

    return saved;
  }

  // Activar o desactivar un recurso
  async toggleActive(id: string, performedById: string, ipAddress?: string) {
    const resource = await this.resourceRepository.findOne({ where: { id } });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    const oldValue = resource.isActive;
    resource.isActive = !resource.isActive;
    await this.resourceRepository.save(resource);

    await this.auditService.createLog(
      'Resource',
      'TOGGLE_ACTIVE',
      performedById,
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
    performedById: string,
    ipAddress?: string,
  ) {
    const resource = await this.resourceRepository.findOne({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException('Recurso no encontrado.');
    }

    const schedule = this.scheduleRepository.create({
      ...dto,
      resourceId,
    });
    const saved = await this.scheduleRepository.save(schedule);

    await this.auditService.createLog(
      'ResourceSchedule',
      'ADD_SCHEDULE',
      performedById,
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
  async removeSchedule(
    scheduleId: string,
    performedById: string,
    ipAddress?: string,
  ) {
    const schedule = await this.scheduleRepository.findOne({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new NotFoundException('Horario no encontrado.');
    }

    schedule.isActive = false;
    await this.scheduleRepository.save(schedule);

    await this.auditService.createLog(
      'ResourceSchedule',
      'REMOVE_SCHEDULE',
      performedById,
      scheduleId,
      { isActive: true },
      { isActive: false },
      ipAddress,
    );
    return { message: 'Horario eliminado correctamente.' };
  }
}
