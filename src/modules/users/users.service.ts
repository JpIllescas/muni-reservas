import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { resolve, sep } from 'path';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UploadDpiDto } from './dto/upload-dpi.dto';
import { AuditService } from '../audit/audit.service';
import { detectFileType } from '../../common/utils/file-signature.utils';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

// Los dos archivos del form-data de POST /users/me/dpi (FileFieldsInterceptor).
export interface DpiFiles {
  dpiFront?: Express.Multer.File[];
  dpiBack?: Express.Multer.File[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly auditService: AuditService,
  ) { }

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

  // Alta directa de una cuenta administrativa (admin/operador) por el super-admin.
  async createByAdmin(
    dto: CreateUserDto,
    performedById: string,
    ipAddress?: string,
  ) {
    // Esta pantalla es solo para cuentas administrativas: el ciudadano se autogestiona por el registro público.
    if (dto.role !== Role.ADMIN && dto.role !== Role.OPERATOR) {
      throw new BadRequestException(
        'Solo se pueden crear cuentas de administrador u operador desde aquí.',
      );
    }

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = this.userRepository.create({
      fullName: dto.fullName,
      email: dto.email,
      phone: dto.phone,
      password: hashedPassword,
      role: dto.role,
      // Creada por un admin: se salta la verificación por correo (OTP).
      isEmailVerified: true,
      isActive: true,
    });

    let saved: User;
    try {
      saved = await this.userRepository.save(user);
    } catch (err) {
      // Unique de email (o dpi): a diferencia del registro público, aquí sí se informa el conflicto (endpoint admin, no hay riesgo de enumeración).
      const pgCode =
        (err as { code?: string }).code ??
        (err as { driverError?: { code?: string } }).driverError?.code;
      if (pgCode === '23505') {
        throw new BadRequestException('Ese correo ya está registrado.');
      }
      throw err;
    }

    await this.auditService.createLog(
      'User',
      'CREATE',
      performedById,
      saved.id,
      undefined,
      { email: saved.email, fullName: saved.fullName, role: saved.role },
      ipAddress,
    );

    // No devolver el hash: replicar la forma de findAll (select whitelist).
    return {
      id: saved.id,
      fullName: saved.fullName,
      email: saved.email,
      dpi: saved.dpi,
      phone: saved.phone,
      role: saved.role,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
    };
  }

  // Edición de una cuenta administrativa (admin/operador) por el super-admin.
  async updateByAdmin(
    id: string,
    dto: AdminUpdateUserDto,
    performedById: string,
    ipAddress?: string,
  ) {
    const user = await this.findOne(id);

    // Solo cuentas administrativas: el ciudadano se autogestiona (mismo criterio
    // que createByAdmin).
    if (user.role !== Role.ADMIN && user.role !== Role.OPERATOR) {
      throw new BadRequestException(
        'Solo se pueden editar cuentas de administrador u operador desde aquí.',
      );
    }

    // Valores previos para la bitácora (sin el hash de contraseña).
    const before = {
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
    };

    if (dto.fullName !== undefined) user.fullName = dto.fullName;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.phone !== undefined) user.phone = dto.phone;

    const passwordChanged = dto.password !== undefined;
    if (passwordChanged) {
      user.password = await bcrypt.hash(dto.password!, 12);
    }

    let saved: User;
    try {
      saved = await this.userRepository.save(user);
    } catch (err) {
      // Unique de email: el nuevo correo ya lo usa otra cuenta.
      const pgCode =
        (err as { code?: string }).code ??
        (err as { driverError?: { code?: string } }).driverError?.code;
      if (pgCode === '23505') {
        throw new BadRequestException('Ese correo ya está registrado.');
      }
      throw err;
    }

    await this.auditService.createLog(
      'User',
      'UPDATE',
      performedById,
      saved.id,
      before,
      {
        fullName: saved.fullName,
        email: saved.email,
        phone: saved.phone,
        // Nunca se registra la contraseña: solo si hubo reseteo.
        passwordChanged,
      },
      ipAddress,
    );

    // No devolver el hash: replicar la forma de findAll (select whitelist).
    return {
      id: saved.id,
      fullName: saved.fullName,
      email: saved.email,
      dpi: saved.dpi,
      phone: saved.phone,
      role: saved.role,
      isActive: saved.isActive,
      createdAt: saved.createdAt,
    };
  }

  // Búsqueda para "crear reserva a nombre de": admin U operador. Devuelve solo lo necesario para identificar al ciudadano (sin rutas de archivos).
  async search(query: string) {
    const q = query.trim();
    if (q.length < 2) {
      return [];
    }
    return this.userRepository
      .createQueryBuilder('u')
      .select(['u.id', 'u.fullName', 'u.email', 'u.dpi', 'u.phone'])
      .where('u.isActive = true')
      .andWhere(
        '(u.fullName ILIKE :like OR u.email ILIKE :like OR u.dpi LIKE :dpiLike)',
        { like: `%${q}%`, dpiLike: `%${q}%` },
      )
      .orderBy('u.fullName', 'ASC')
      .take(10)
      .getMany();
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
        'dpiFrontPath',
        'dpiBackPath',
        'phone',
        'role',
        'isSuperAdmin',
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

    // DPI de una sola escritura: solo se acepta si aún está vacío. Ya fijado es inmutable (identidad), aunque manden el mismo valor.
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

  // ==========================================================================
  // DPI con fotos (frente y reverso), caso "no vecino antigüeño".
  // ==========================================================================

  async uploadDpi(
    userId: string,
    files: DpiFiles,
    dto: UploadDpiDto,
    ipAddress?: string,
  ) {
    const front = files.dpiFront?.[0];
    const back = files.dpiBack?.[0];

    // Borra lo que Multer ya haya escrito si la operación no procede.
    const cleanup = async () => {
      if (front) await fs.unlink(front.path).catch(() => undefined);
      if (back) await fs.unlink(back.path).catch(() => undefined);
    };

    if (!front || !back) {
      await cleanup();
      throw new BadRequestException(
        'Debes adjuntar las dos fotos del DPI: frente (dpiFront) y reverso (dpiBack).',
      );
    }

    // Magic bytes: solo imágenes reales (el mimetype de Multer no es confiable).
    for (const file of [front, back]) {
      const realType = await detectFileType(file.path);
      if (realType !== 'jpg' && realType !== 'png') {
        await cleanup();
        throw new BadRequestException(
          'Cada foto del DPI debe ser una imagen JPG o PNG válida.',
        );
      }
    }

    const user = await this.userRepository.findOneBy({ id: userId });
    if (!user) {
      await cleanup();
      throw new NotFoundException('Usuario no encontrado.');
    }

    // Número: misma regla que updateProfile. Si ya está fijado no se acepta el campo (ni con el mismo valor); si falta, tiene que venir aquí.
    if (dto.dpi !== undefined) {
      if (user.dpi) {
        await cleanup();
        throw new BadRequestException(
          'El DPI ya está establecido y no se puede modificar.',
        );
      }
      user.dpi = dto.dpi;
    }
    if (!user.dpi) {
      await cleanup();
      throw new BadRequestException(
        'Falta el número de DPI: envíalo junto con las fotos.',
      );
    }

    const oldFront = user.dpiFrontPath;
    const oldBack = user.dpiBackPath;
    user.dpiFrontPath = front.path;
    user.dpiBackPath = back.path;

    try {
      await this.userRepository.save(user);
    } catch (err) {
      await cleanup();
      // Unique de dpi: otro usuario ya lo registró (carrera incluida).
      const pgCode =
        (err as { code?: string }).code ??
        (err as { driverError?: { code?: string } }).driverError?.code;
      if (pgCode === '23505') {
        throw new BadRequestException('Ese DPI ya está registrado.');
      }
      throw err;
    }

    if (oldFront && oldFront !== front.path) {
      await fs.unlink(oldFront).catch(() => undefined);
    }
    if (oldBack && oldBack !== back.path) {
      await fs.unlink(oldBack).catch(() => undefined);
    }

    // Rastro: es un documento de identidad (best-effort, nunca revienta).
    await this.auditService.createLog(
      'User',
      'UPLOAD_DPI',
      userId,
      userId,
      { dpiFrontPath: oldFront, dpiBackPath: oldBack },
      { dpiFrontPath: front.path, dpiBackPath: back.path },
      ipAddress,
    );

    return {
      message: 'DPI registrado correctamente.',
      dpi: user.dpi,
      dpiFrontPath: user.dpiFrontPath,
      dpiBackPath: user.dpiBackPath,
    };
  }

  // Devuelve la ruta física + content-type de una foto del DPI, ya autorizada
  async getDpiFile(
    targetUserId: string,
    side: 'front' | 'back',
    requester: AuthUser,
    ipAddress?: string,
  ) {
    if (side !== 'front' && side !== 'back') {
      throw new BadRequestException('Lado inválido: usa "front" o "back".');
    }

    if (
      requester.id !== targetUserId &&
      requester.role !== Role.ADMIN &&
      requester.role !== Role.OPERATOR
    ) {
      throw new ForbiddenException(
        'No tienes permiso para ver este documento.',
      );
    }

    const user = await this.userRepository.findOneBy({ id: targetUserId });
    if (!user) {
      throw new NotFoundException('Usuario no encontrado.');
    }

    const storedPath = side === 'front' ? user.dpiFrontPath : user.dpiBackPath;
    if (!storedPath) {
      throw new NotFoundException('El usuario no tiene esa foto del DPI.');
    }

    // Anti path-traversal: la ruta guardada debe vivir bajo UPLOAD_PATH
    // (mismo guard que las boletas).
    const uploadsDir = resolve(process.env.UPLOAD_PATH || './uploads');
    const absPath = resolve(storedPath);
    if (!absPath.startsWith(uploadsDir + sep)) {
      throw new NotFoundException('Documento no encontrado.');
    }

    try {
      await fs.access(absPath);
    } catch {
      throw new NotFoundException('El archivo del DPI ya no está disponible.');
    }

    const realType = await detectFileType(absPath);
    const contentType =
      realType === 'png'
        ? 'image/png'
        : realType === 'jpg'
          ? 'image/jpeg'
          : 'application/octet-stream';

    // Bitácora de LECTURA sensible: solo cuando alguien consulta un DPI ajeno (el dueño viendo el suyo no es fiscalizable).
    if (requester.id !== targetUserId) {
      await this.auditService.createLog(
        'User',
        'VIEW_DPI',
        requester.id,
        targetUserId,
        undefined,
        { side },
        ipAddress,
      );
    }

    return { path: absPath, contentType, fileName: `dpi-${side}` };
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
