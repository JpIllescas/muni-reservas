import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Delete,
  Ip,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ResourcesService } from './resources.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { CreateExceptionDto } from './dto/create-exception.dto';
import { CreateScheduleOverrideDto } from './dto/create-schedule-override.dto';
import { UpdateResourceStatusDto } from './dto/update-resource-status.dto';
import { AvailabilityQueryDto } from './dto/availability-query.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  // GET /api/resources — público, cualquiera puede ver el catálogo
  @Get()
  findAll() {
    return this.resourcesService.findAll();
  }

  // GET /api/resources/admin — solo admin y operador (recursos de sus sedes)
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  findAllAdmin(@CurrentUser() user: AuthUser) {
    return this.resourcesService.findAllAdmin(user);
  }

  // GET /api/resources/:id — público
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.resourcesService.findOne(id);
  }

  // GET /api/resources/:id/availability?date=YYYY-MM-DD — público
  // Disponibilidad del recurso ese día (horario, tope y franjas ocupadas).
  @Get(':id/availability')
  getAvailability(
    @Param('id') id: string,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.resourcesService.getAvailability(id, query.date);
  }

  // POST /api/resources — solo admin
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(
    @Body() dto: CreateResourceDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.resourcesService.create(dto, user, ip);
  }

  // PATCH /api/resources/:id — solo admin
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateResourceDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.resourcesService.update(id, dto, user, ip);
  }

  // PATCH /api/resources/:id/toggle-active — solo admin
  @Patch(':id/toggle-active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  toggleActive(
    @Param('id') id: string,
    @CurrentUser() userInfo: AuthUser,
    @Ip() ip: string,
  ) {
    return this.resourcesService.toggleActive(id, userInfo, ip);
  }

  // PATCH /api/resources/:id/status — admin y operador (REC-2)
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateResourceStatusDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.resourcesService.updateStatus(id, dto, user, ip);
  }

  // POST /api/resources/:id/schedules — solo admin
  @Post(':id/schedules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  addSchedule(
    @Param('id') id: string,
    @Body() dto: CreateScheduleDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.resourcesService.addSchedule(id, dto, user, ip);
  }

  // GET /api/resources/:id/schedules — público
  @Get(':id/schedules')
  getSchedules(@Param('id') id: string) {
    return this.resourcesService.getSchedules(id);
  }

  // DELETE /api/resources/schedules/:scheduleId — solo admin
  @Delete('schedules/:scheduleId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  removeSchedule(
    @Param('scheduleId') scheduleId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.resourcesService.removeSchedule(scheduleId, user, ip);
  }

  // POST /api/resources/:id/exceptions — admin y operador
  @Post(':id/exceptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  addException(
    @Param('id') id: string,
    @Body() dto: CreateExceptionDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.resourcesService.addException(id, dto, user, ip);
  }

  // GET /api/resources/:id/exceptions — admin y operador
  @Get(':id/exceptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  getExceptions(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.resourcesService.getExceptions(id, user);
  }

  // DELETE /api/resources/exceptions/:exceptionId — admin y operador
  @Delete('exceptions/:exceptionId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  removeException(
    @Param('exceptionId') exceptionId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.resourcesService.removeException(exceptionId, user, ip);
  }

  // POST /api/resources/:id/schedule-overrides — admin y operador (REC-3)
  @Post(':id/schedule-overrides')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  addScheduleOverride(
    @Param('id') id: string,
    @Body() dto: CreateScheduleOverrideDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.resourcesService.addScheduleOverride(id, dto, user, ip);
  }

  // GET /api/resources/:id/schedule-overrides — admin y operador (REC-3)
  @Get(':id/schedule-overrides')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  getScheduleOverrides(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.resourcesService.getScheduleOverrides(id, user);
  }

  // DELETE /api/resources/schedule-overrides/:overrideId — admin y operador (REC-3)
  @Delete('schedule-overrides/:overrideId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  removeScheduleOverride(
    @Param('overrideId') overrideId: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.resourcesService.removeScheduleOverride(overrideId, user, ip);
  }
}
