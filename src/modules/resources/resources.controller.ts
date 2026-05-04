import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Delete,
} from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { CreateResourceDto } from './dto/create-resource.dto';
import { UpdateResourceDto } from './dto/update-resource.dto';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

@Controller('resources')
export class ResourcesController {
  constructor(private readonly resourcesService: ResourcesService) {}

  // GET /api/resources — público, cualquiera puede ver el catálogo
  @Get()
  findAll() {
    return this.resourcesService.findAll();
  }

  // GET /api/resources/admin — solo admin y operador
  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.OPERATOR)
  findAllAdmin() {
    return this.resourcesService.findAllAdmin();
  }

  // GET /api/resources/:id — público
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.resourcesService.findOne(id);
  }

  // POST /api/resources — solo admin
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateResourceDto) {
    return this.resourcesService.create(dto);
  }

  // PATCH /api/resources/:id — solo admin
  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  update(@Param('id') id: string, @Body() dto: UpdateResourceDto) {
    return this.resourcesService.update(id, dto);
  }

  // PATCH /api/resources/:id/toggle-active — solo admin
  @Patch(':id/toggle-active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  toggleActive(@Param('id') id: string) {
    return this.resourcesService.toggleActive(id);
  }

  // POST /api/resources/:id/schedules — solo admin
  @Post(':id/schedules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  addSchedule(@Param('id') id: string, @Body() dto: CreateScheduleDto) {
    return this.resourcesService.addSchedule(id, dto);
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
  removeSchedule(@Param('scheduleId') scheduleId: string) {
    return this.resourcesService.removeSchedule(scheduleId);
  }
}
