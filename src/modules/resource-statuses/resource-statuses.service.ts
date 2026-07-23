import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResourceStatusEntity } from './entities/resource-status.entity';
import { CreateResourceStatusDto } from './dto/create-resource-status.dto';
import { UpdateResourceStatusCatalogDto } from './dto/update-resource-status-catalog.dto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

@Injectable()
export class ResourceStatusesService {
  constructor(
    @InjectRepository(ResourceStatusEntity)
    private readonly repo: Repository<ResourceStatusEntity>,

    private readonly auditService: AuditService,
  ) {}

  // Lista para el desplegable (solo activos) o todos (gestión).
  async findAll(includeInactive = false) {
    return this.repo.find({
      where: includeInactive ? {} : { isActive: true },
      order: { sortOrder: 'ASC', label: 'ASC' },
    });
  }

  async findOne(id: string) {
    const status = await this.repo.findOne({ where: { id } });
    if (!status) {
      throw new NotFoundException('Estado de recurso no encontrado.');
    }
    return status;
  }

  // Resuelve un estado por su key. Tolerante (devuelve null si no existe): lo usa
  // la disponibilidad y el chequeo de bloqueo, donde un estado inactivo aún debe
  // resolverse por historial (un recurso puede seguir referenciándolo).
  async findByKeyOrNull(key: string): Promise<ResourceStatusEntity | null> {
    return this.repo.findOne({ where: { key } });
  }

  // Valida que un estado exista y esté activo para ASIGNARLO a un recurso
  // (updateStatus del recurso). Estricto: un estado inactivo no se puede elegir.
  async findActiveByKey(key: string): Promise<ResourceStatusEntity> {
    const status = await this.repo.findOne({ where: { key } });
    if (!status) {
      throw new BadRequestException('El estado indicado no existe.');
    }
    if (!status.isActive) {
      throw new BadRequestException('El estado indicado no está activo.');
    }
    return status;
  }

  async create(
    dto: CreateResourceStatusDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const existing = await this.repo.findOne({ where: { key: dto.key } });
    if (existing) {
      throw new BadRequestException(
        `Ya existe un estado con la clave "${dto.key}".`,
      );
    }

    // is_default / visible_in_catalog no se exponen: un estado creado por el admin
    // nunca es el default (ese es 'available', sembrado) y es visible por defecto.
    const status = this.repo.create({
      key: dto.key,
      label: dto.label,
      blocksReservations: dto.blocksReservations ?? false,
      color: dto.color ?? null,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    const saved = await this.repo.save(status);

    await this.auditService.createLog(
      'ResourceStatus',
      'CREATE',
      user.id,
      saved.id,
      undefined,
      { ...dto },
      ipAddress,
    );
    return saved;
  }

  async update(
    id: string,
    dto: UpdateResourceStatusCatalogDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const status = await this.findOne(id);
    const oldValue = {
      label: status.label,
      blocksReservations: status.blocksReservations,
      color: status.color,
      isActive: status.isActive,
      sortOrder: status.sortOrder,
    };
    // key NO se toca (inmutable). Object.assign solo con los campos del DTO.
    Object.assign(status, dto);
    const saved = await this.repo.save(status);

    await this.auditService.createLog(
      'ResourceStatus',
      'UPDATE',
      user.id,
      id,
      oldValue,
      { ...dto },
      ipAddress,
    );
    return saved;
  }

  async toggleActive(id: string, user: AuthUser, ipAddress?: string) {
    const status = await this.findOne(id);

    // El estado default ('available') no se puede desactivar: es el que reciben
    // los recursos nuevos y al que se vuelve para reabrir un recurso.
    if (status.isActive && status.isDefault) {
      throw new BadRequestException(
        'No se puede desactivar el estado predeterminado.',
      );
    }

    const oldValue = status.isActive;
    status.isActive = !status.isActive;
    await this.repo.save(status);

    await this.auditService.createLog(
      'ResourceStatus',
      'TOGGLE_ACTIVE',
      user.id,
      id,
      { isActive: oldValue },
      { isActive: status.isActive },
      ipAddress,
    );
    return {
      message: `Estado ${status.isActive ? 'activado' : 'desactivado'} correctamente.`,
    };
  }
}
