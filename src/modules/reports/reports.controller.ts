import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';

// Solo adminitradores y operadores pueden ver reportes
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('reservations-by-status')
  getReservationsByStatus() {
    return this.reportsService.getReservationsByStatus();
  }

  @Get('popular-resources')
  getPopularResource() {
    return this.reportsService.getPopularResource();
  }
}
