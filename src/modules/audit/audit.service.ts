import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  // Método que usan los otros módulos para registrar acciones. Es "best-effort":
  // un fallo al auditar NO debe tumbar la operación principal (que ya se ejecutó
  // fuera de esta llamada). Se registra el error en el log del servidor para no
  // perderlo del todo.
  async createLog(
    entityType: string,
    action: string,
    performedById: string,
    entityId?: string,
    oldValue?: Record<string, any>,
    newValue?: Record<string, any>,
    ipAddress?: string,
  ) {
    const log = this.auditRepository.create({
      entityType,
      action,
      performedById,
      entityId,
      oldValue,
      newValue,
      ipAddress,
    });

    try {
      return await this.auditRepository.save(log);
    } catch (error) {
      this.logger.error(
        `No se pudo guardar el audit log (${entityType}/${action}, entityId=${entityId}).`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }

  // Listado de la bitácora para el administrador, con filtros combinables
  // (entidad, acción, actor, rango de fechas) y paginado {data, meta}.
  async findAll(filters: {
    page: number;
    limit: number;
    entityType?: string;
    action?: string;
    user?: string;
    from?: string;
    to?: string;
  }) {
    const query = this.auditRepository
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.performedBy', 'u')
      .orderBy('a.createdAt', 'DESC');

    if (filters.entityType) {
      query.andWhere('a.entityType = :entityType', {
        entityType: filters.entityType,
      });
    }
    if (filters.action) {
      query.andWhere('a.action ILIKE :action', {
        action: `%${filters.action}%`,
      });
    }
    if (filters.user) {
      query.andWhere('(u.fullName ILIKE :actor OR u.email ILIKE :actor)', {
        actor: `%${filters.user}%`,
      });
    }
    // Rango por fecha (inclusive): [from 00:00, to+1día).
    if (filters.from) {
      query.andWhere('a.createdAt >= :from', { from: filters.from });
    }
    if (filters.to) {
      query.andWhere("a.createdAt < :to::date + interval '1 day'", {
        to: filters.to,
      });
    }

    const skip = (filters.page - 1) * filters.limit;
    query.skip(skip).take(filters.limit);

    const [data, total] = await query.getManyAndCount();
    return {
      data,
      meta: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    };
  }
}
