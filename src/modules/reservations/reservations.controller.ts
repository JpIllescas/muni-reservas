import { Controller, Get, Post, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import { ReservationStatus } from '../../common/enums/reservation-status.enum';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  // POST /api/reservations - cualquier usuario autenticado 
  @Post()
  create(
    @CurrentUser() user: any,
    @Body() dto: CreateReservationDto,
  ) {
    return this.reservationsService.create(user.id, dto);
  }

  // GET /api/reservations - admin y operador ven todas
  @Get()
  @Roles(Role.ADMIN, Role.OPERATOR)
  findAll(@Query('status') status?: ReservationStatus) {
    return this.reservationsService.findAll(status);
  }

  // GET /api/reservations/my - el ciudadano ve sus propias reservas
  @Get('my')
  findMyReservations(@CurrentUser() user:any) {
    return this.reservationsService.findMyReservations(user.id);
  }

  // GET /api/reservations/:id - detalle de una reserva 
  @Get(':id')
  findOne(
     @Param('id') id: string,
     @CurrentUser() user: any,
  ) {
    return this.reservationsService.findOne(id, user.id, user.role);
  }

  // PATCH /api/reservations/:id/status - admin y operador 
  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.OPERATOR)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReservationStatusDto,
    @CurrentUser() user: any,
  ) {
    return this.reservationsService.updateStatus(id, dto, user.id);
  }

  // PATCH /api/reservations/:id/cancel - el ciudadadno cancela su reserva
  @Patch(':id/cancel')
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.reservationsService.cancel(id, user.id);
  }
}