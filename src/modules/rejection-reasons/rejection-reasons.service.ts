import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RejectionReason } from './entities/rejection-reason.entity';
import { CreateRejectionReasonDto } from './dto/create-rejection-reason.dto';
import { UpdateRejectionReasonDto } from './dto/update-rejection-reason.dto';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

@Injectable()
export class RejectionReasonsService {
  constructor(
    @InjectRepository(RejectionReason)
    private readonly repo: Repository<RejectionReason>,

    private readonly auditService: AuditService,
  ) {}

  // Lista para el desplegable de rechazo (solo activos) o todos (gestión).
  async findAll(includeInactive = false) {
    return this.repo.find({
      where: includeInactive ? {} : { isActive: true },
      order: { sortOrder: 'ASC', labelAdmin: 'ASC' },
    });
  }

  async findOne(id: string) {
    const reason = await this.repo.findOne({ where: { id } });
    if (!reason) {
      throw new NotFoundException('Motivo de rechazo no encontrado.');
    }
    return reason;
  }

  async create(
    dto: CreateRejectionReasonDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const reason = this.repo.create(dto);
    const saved = await this.repo.save(reason);

    await this.auditService.createLog(
      'RejectionReason',
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
    dto: UpdateRejectionReasonDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const reason = await this.findOne(id);
    const oldValue = {
      labelAdmin: reason.labelAdmin,
      messageCitizen: reason.messageCitizen,
      isActive: reason.isActive,
      sortOrder: reason.sortOrder,
    };
    Object.assign(reason, dto);
    const saved = await this.repo.save(reason);

    await this.auditService.createLog(
      'RejectionReason',
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
    const reason = await this.findOne(id);
    const oldValue = reason.isActive;
    reason.isActive = !reason.isActive;
    await this.repo.save(reason);

    await this.auditService.createLog(
      'RejectionReason',
      'TOGGLE_ACTIVE',
      user.id,
      id,
      { isActive: oldValue },
      { isActive: reason.isActive },
      ipAddress,
    );
    return {
      message: `Motivo ${reason.isActive ? 'activado' : 'desactivado'} correctamente.`,
    };
  }

  // Resuelve el motivo elegido al rechazar una reserva (lo usa ReservationsService).
  // Devuelve el texto para el ciudadano; valida que exista y esté activo.
  async resolveForRejection(id: string): Promise<RejectionReason> {
    const reason = await this.repo.findOne({ where: { id } });
    if (!reason) {
      throw new BadRequestException('El motivo de rechazo no existe.');
    }
    if (!reason.isActive) {
      throw new BadRequestException('El motivo de rechazo ya no está activo.');
    }
    return reason;
  }
}
