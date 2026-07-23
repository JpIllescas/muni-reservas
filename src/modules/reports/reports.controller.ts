import { Controller, Get, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/role.enum';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

// Solo adminitradores y operadores pueden ver reportes (acotados a sus sedes)
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.OPERATOR)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('reservations-by-status')
  getReservationsByStatus(@CurrentUser() user: AuthUser) {
    return this.reportsService.getReservationsByStatus(user);
  }

  @Get('popular-resources')
  getPopularResource(@CurrentUser() user: AuthUser) {
    return this.reportsService.getPopularResource(user);
  }
}
