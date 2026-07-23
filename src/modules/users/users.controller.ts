import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  StreamableFile,
  Ip,
} from '@nestjs/common';
import { createReadStream } from 'fs';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import type { DpiFiles } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { AdminUpdateUserDto } from './dto/admin-update-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UploadDpiDto } from './dto/upload-dpi.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  // GET /api/users - Solo admin
  @Get()
  @Roles(Role.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  // POST /api/users - alta directa de una cuenta administrativa (admin/operador).
  @Post()
  @UseGuards(SuperAdminGuard)
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.usersService.createByAdmin(dto, user.id, ip);
  }

  // GET /api/users/me - cualquier usuario autenticado ve su propio perfil
  @Get('me')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.usersService.findOne(user.id);
  }

  // GET /api/users/search?q= - admin/operador buscan un ciudadano para crearle una reserva. Declarada ANTES de :id para que 'search' no matchee ahí.
  @Get('search')
  @Roles(Role.ADMIN, Role.OPERATOR)
  search(@Query('q') q: string) {
    return this.usersService.search(q ?? '');
  }

  // GET /api/users/:id - solo admin
  @Get(':id')
  @Roles(Role.ADMIN)
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  // PATCH /api/isers/me - el ciudadano actualiza su propio perfil
  @Patch('me')
  updateProfile(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto) {
    return this.usersService.updateProfile(user.id, dto);
  }

  // POST /api/users/me/dpi - subir las DOS fotos del DPI (form-data: dpiFront + dpiBack) y, si aún no está fijado, el número. Requisito para poder reservar.
  @Post('me/dpi')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'dpiFront', maxCount: 1 },
      { name: 'dpiBack', maxCount: 1 },
    ]),
  )
  uploadDpi(
    @CurrentUser() user: AuthUser,
    @UploadedFiles() files: DpiFiles,
    @Body() dto: UploadDpiDto,
    @Ip() ip: string,
  ) {
    return this.usersService.uploadDpi(user.id, files, dto, ip);
  }

  // GET /api/users/me/dpi/:side - el dueño ve su propia foto (front|back)
  @Get('me/dpi/:side')
  async getMyDpiFile(
    @CurrentUser() user: AuthUser,
    @Param('side') side: 'front' | 'back',
  ): Promise<StreamableFile> {
    const { path, contentType, fileName } = await this.usersService.getDpiFile(
      user.id,
      side,
      user,
    );
    return new StreamableFile(createReadStream(path), {
      type: contentType,
      disposition: `inline; filename="${fileName}"`,
    });
  }

  // GET /api/users/:id/dpi/:side - admin/operador verifican el DPI (vecindad).
  // La consulta queda en la bitácora (VIEW_DPI) con la IP del actor.
  @Get(':id/dpi/:side')
  @Roles(Role.ADMIN, Role.OPERATOR)
  async getUserDpiFile(
    @Param('id') id: string,
    @Param('side') side: 'front' | 'back',
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ): Promise<StreamableFile> {
    const { path, contentType, fileName } = await this.usersService.getDpiFile(
      id,
      side,
      user,
      ip,
    );
    return new StreamableFile(createReadStream(path), {
      type: contentType,
      disposition: `inline; filename="${fileName}"`,
    });
  }

  // PATCH /api/users/:id/role - solo admin
  @Patch(':id/role')
  @Roles(Role.ADMIN)
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.usersService.updateRole(id, dto, user.id, ip);
  }

  // PATCH /api/users/:id/toggle-active - solo admin
  @Patch(':id/toggle-active')
  @Roles(Role.ADMIN)
  toggleActive(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.usersService.toggleActive(id, user.id, ip);
  }

  // PATCH /api/users/:id - edición de una cuenta administrativa (nombre, correo, teléfono, reseteo de contraseña). 
  @Patch(':id')
  @UseGuards(SuperAdminGuard)
  update(
    @Param('id') id: string,
    @Body() dto: AdminUpdateUserDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.usersService.updateByAdmin(id, dto, user.id, ip);
  }
}
