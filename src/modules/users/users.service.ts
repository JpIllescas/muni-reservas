import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
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

    Object.assign(user, dto);
    return this.userRepository.save(user);
  }

  // Admin cambia el rol de un usuario
  async updateRole(id: string, dto: UpdateRoleDto) {
    const user = await this.findOne(id);
    user.role = dto.role;
    return this.userRepository.save(user);
  }

  // Admin activa o desactiva un usuario
  async toggleActive(id: string) {
    const user = await this.findOne(id);
    user.isActive = !user.isActive;
    await this.userRepository.save(user);
    return {
      message: `Usuario ${user.isActive ? 'activado' : 'desactivado'} correctamente.`,
    };
  }
}
