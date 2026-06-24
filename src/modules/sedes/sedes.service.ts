import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sede } from '../resources/entities/sede.entity';
import { User } from '../users/entities/user.entity';
import { CreateSedeDto } from './dto/create-sede.dto';
import { UpdateSedeDto } from './dto/update-sede.dto';
import { AuditService } from '../audit/audit.service';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

// ADM-1 Fase 3 — Gestión de sedes y asignación de admins/operadores a sedes.
// Todo el módulo está protegido por SuperAdminGuard a nivel de controlador.
@Injectable()
export class SedesService {
  constructor(
    @InjectRepository(Sede)
    private readonly sedeRepository: Repository<Sede>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateSedeDto, user: AuthUser, ipAddress?: string) {
    const sede = this.sedeRepository.create(dto);
    const saved = await this.sedeRepository.save(sede);

    await this.auditService.createLog(
      'Sede',
      'CREATE',
      user.id,
      saved.id,
      undefined,
      { ...dto },
      ipAddress,
    );

    return saved;
  }

  async findAll() {
    return this.sedeRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string) {
    const sede = await this.sedeRepository.findOne({ where: { id } });
    if (!sede) {
      throw new NotFoundException('Sede no encontrada.');
    }
    return sede;
  }

  async update(
    id: string,
    dto: UpdateSedeDto,
    user: AuthUser,
    ipAddress?: string,
  ) {
    const sede = await this.findOne(id);
    const oldValue = { name: sede.name, address: sede.address };

    Object.assign(sede, dto);
    const saved = await this.sedeRepository.save(sede);

    await this.auditService.createLog(
      'Sede',
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
    const sede = await this.findOne(id);
    const oldValue = sede.isActive;
    sede.isActive = !sede.isActive;
    await this.sedeRepository.save(sede);

    await this.auditService.createLog(
      'Sede',
      'TOGGLE_ACTIVE',
      user.id,
      id,
      { isActive: oldValue },
      { isActive: sede.isActive },
      ipAddress,
    );

    return {
      message: `Sede ${sede.isActive ? 'activada' : 'desactivada'} correctamente.`,
    };
  }

  // Asigna un admin/operador a una sede. Idempotente: si ya estaba asignado, no
  // hace nada (evita el choque de PK (user_id, sede_id)).
  async assignUser(
    sedeId: string,
    userId: string,
    actor: AuthUser,
    ipAddress?: string,
  ) {
    await this.findOne(sedeId); // 404 si la sede no existe

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }
    // Solo tiene sentido acotar por sede a quien gestiona (no a ciudadanos).
    if (user.role !== Role.ADMIN && user.role !== Role.OPERATOR) {
      throw new BadRequestException(
        'Solo se puede asignar a una sede a un administrador u operador.',
      );
    }

    const alreadyAssigned = await this.userRepository
      .createQueryBuilder('u')
      .innerJoin('u.sedes', 's', 's.id = :sedeId', { sedeId })
      .where('u.id = :userId', { userId })
      .getCount();

    if (alreadyAssigned > 0) {
      return { message: 'El usuario ya estaba asignado a esta sede.' };
    }

    await this.userRepository
      .createQueryBuilder()
      .relation(User, 'sedes')
      .of(userId)
      .add(sedeId);

    await this.auditService.createLog(
      'Sede',
      'ASSIGN_USER',
      actor.id,
      sedeId,
      undefined,
      { userId },
      ipAddress,
    );

    return { message: 'Usuario asignado a la sede correctamente.' };
  }

  // Quita un admin/operador de una sede. `relation().remove()` es no-op si el
  // vínculo no existe, así que no hace falta validarlo.
  async removeUser(
    sedeId: string,
    userId: string,
    actor: AuthUser,
    ipAddress?: string,
  ) {
    await this.findOne(sedeId); // 404 si la sede no existe

    await this.userRepository
      .createQueryBuilder()
      .relation(User, 'sedes')
      .of(userId)
      .remove(sedeId);

    await this.auditService.createLog(
      'Sede',
      'REMOVE_USER',
      actor.id,
      sedeId,
      { userId },
      undefined,
      ipAddress,
    );

    return { message: 'Usuario removido de la sede correctamente.' };
  }

  // Lista los admins/operadores asignados a una sede (sin datos sensibles).
  async listUsers(sedeId: string) {
    await this.findOne(sedeId);

    return this.userRepository
      .createQueryBuilder('u')
      .innerJoin('u.sedes', 's', 's.id = :sedeId', { sedeId })
      .select([
        'u.id',
        'u.fullName',
        'u.email',
        'u.role',
        'u.isActive',
        'u.isSuperAdmin',
      ])
      .orderBy('u.fullName', 'ASC')
      .getMany();
  }
}
