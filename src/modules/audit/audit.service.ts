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

  // Metodo para que el administrador vea todo el historial de cambios
  async findAll(limit: number = 50, offset: number = 0) {
    return this.auditRepository.find({
      relations: ['performedBy'],
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });
  }
}
