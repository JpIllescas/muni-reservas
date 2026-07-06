import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly auditService: AuditService,
  ) {}

  // Obtener todos los usuarios — solo admin
  async findAll() {
    return this.userRepository.find({
      select: [
        'id',
        'fullName',
        'email',
        'dpi',
        'phone',
        'role',
        'isActive',
        'createdAt',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  // Obtener un usuario por id
  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      select: [
        'id',
        'fullName',
        'email',
        'dpi',
        'phone',
        'role',
        'isActive',
        'createdAt',
      ],
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    return user;
  }

  // El ciudadano actualiza su propio perfil
  async updateProfile(id: string, dto: UpdateUserDto) {
    const user = await this.findOne(id);

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.phone !== undefined) user.phone = dto.phone;

    // DPI de una sola escritura: solo se acepta si aún está vacío. Ya fijado es
    // inmutable (identidad), aunque manden el mismo valor.
    if (dto.dpi !== undefined) {
      if (user.dpi) {
        throw new BadRequestException(
          'El DPI ya está establecido y no se puede modificar.',
        );
      }
      user.dpi = dto.dpi;
    }

    try {
      return await this.userRepository.save(user);
    } catch (err) {
      // Unique de dpi: otro usuario ya lo registró (carrera incluida).
      const pgCode =
        (err as { code?: string }).code ??
        (err as { driverError?: { code?: string } }).driverError?.code;
      if (pgCode === '23505') {
        throw new BadRequestException('Ese DPI ya está registrado.');
      }
      throw err;
    }
  }

  // Admin cambia el rol de un usuario
  async updateRole(
    id: string,
    dto: UpdateRoleDto,
    performedById: string,
    ipAddress?: string,
  ) {
    const user = await this.findOne(id);
    const oldRole = user.role;
    user.role = dto.role;
    const saved = await this.userRepository.save(user);

    await this.auditService.createLog(
      'User',
      'UPDATE_ROLE',
      performedById,
      id,
      { role: oldRole },
      { role: dto.role },
      ipAddress,
    );

    return saved;
  }

  // Admin activa o desactiva un usuario
  async toggleActive(id: string, performedById: string, ipAddress?: string) {
    const user = await this.findOne(id);
    const oldValue = user.isActive;
    user.isActive = !user.isActive;
    await this.userRepository.save(user);

    await this.auditService.createLog(
      'User',
      'TOGGLE_ACTIVE',
      performedById,
      id,
      { isActive: oldValue },
      { isActive: user.isActive },
      ipAddress,
    );

    return {
      message: `Usuario ${user.isActive ? 'activado' : 'desactivado'} correctamente.`,
    };
  }
}
