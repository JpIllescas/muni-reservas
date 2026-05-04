import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepository: Repository<AuditLog>,
  ) {}

  // Metoo que usaran los otroso modulso para registrar acciones (sin bloquear su ejecucion)
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

    // Lo guardamos de manera asincrona. si falla por algún motivo.
    // el proceso principal, para eso usamos un try chat silencioso o lo dejamos a simple
    return this.auditRepository.save(log);
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
