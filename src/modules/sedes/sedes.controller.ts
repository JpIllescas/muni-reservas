import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Ip,
} from '@nestjs/common';
import { SedesService } from './sedes.service';
import { CreateSedeDto } from './dto/create-sede.dto';
import { UpdateSedeDto } from './dto/update-sede.dto';
import { AssignUserDto } from './dto/assign-user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from '../../common/guards/super-admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

// Todo el módulo es exclusivo del super-admin (ADM-1 Fase 3).
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller('sedes')
export class SedesController {
  constructor(private readonly sedesService: SedesService) {}

  @Post()
  create(
    @Body() dto: CreateSedeDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.sedesService.create(dto, user, ip);
  }

  @Get()
  findAll() {
    return this.sedesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sedesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSedeDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.sedesService.update(id, dto, user, ip);
  }

  @Patch(':id/toggle-active')
  toggleActive(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.sedesService.toggleActive(id, user, ip);
  }

  // --- Asignación de admins/operadores a la sede ---

  @Get(':id/users')
  listUsers(@Param('id') id: string) {
    return this.sedesService.listUsers(id);
  }

  @Post(':id/users')
  assignUser(
    @Param('id') id: string,
    @Body() dto: AssignUserDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.sedesService.assignUser(id, dto.userId, user, ip);
  }

  @Delete(':id/users/:userId')
  removeUser(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.sedesService.removeUser(id, userId, user, ip);
  }
}
