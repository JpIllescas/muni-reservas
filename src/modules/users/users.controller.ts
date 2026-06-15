import { Controller, Get, Patch, Param, Body, UseGuards, Ip } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
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

  // GET /api/users/me - cualquier usuario autenticado ve su propio perfil
  @Get('me')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.usersService.findOne(user.id);
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
}
