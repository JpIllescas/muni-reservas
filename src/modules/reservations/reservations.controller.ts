import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
  Ip,
} from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { AdminCreateReservationDto } from './dto/admin-create-reservation.dto';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { ProposeReassignmentDto } from './dto/propose-reassignment.dto';
import { SetPriceDto } from './dto/set-price.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/role.enum';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { FindReservationsDto } from './dto/find-reservations.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) { }

  // POST /api/reservations - cualquier usuario autenticado
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateReservationDto) {
    return this.reservationsService.create(user.id, dto);
  }

  // POST /api/reservations/admin - admin/operador crea una reserva a nombre de un ciudadano existente, acotado a los recursos de sus sedes.
  @Post('admin')
  @Roles(Role.ADMIN, Role.OPERATOR)
  adminCreate(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdminCreateReservationDto,
    @Ip() ip: string,
  ) {
    return this.reservationsService.create(dto.userId, dto, user, ip);
  }

  // GET /api/reservations - admin y operador ven las reservas de sus sedes
  @Get()
  @Roles(Role.ADMIN, Role.OPERATOR)
  findAll(@CurrentUser() user: AuthUser, @Query() dto: FindReservationsDto) {
    return this.reservationsService.findAll(
      user,
      dto.status,
      dto.page,
      dto.limit,
    );
  }

  // GET /api/reservations/my - el ciudadano ve sus propias reservas
  @Get('my')
  findMyReservations(@CurrentUser() user: AuthUser) {
    return this.reservationsService.findMyReservations(user.id);
  }

  // GET /api/reservations/:id - detalle de una reserva
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reservationsService.findOne(id, user);
  }

  // GET /api/reservations/:id/history - línea de tiempo de cambios de estado
  @Get(':id/history')
  getHistory(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reservationsService.getHistory(id, user);
  }

  // PATCH /api/reservations/:id/status - admin y operador
  @Patch(':id/status')
  @Roles(Role.ADMIN, Role.OPERATOR)
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateReservationStatusDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.reservationsService.updateStatus(id, dto, user, ip);
  }

  // PATCH /api/reservations/:id/price - fijar el precio FINAL de una reserva puntual (carta/acuerdo).
  @Patch(':id/price')
  @Roles(Role.ADMIN)
  setPrice(
    @Param('id') id: string,
    @Body() dto: SetPriceDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.reservationsService.setPrice(id, dto, user, ip);
  }

  // PATCH /api/reservations/:id/revert-rejection - revertir un rechazo.
  // Exclusivo de la administración (decisión D); solo si el horario sigue libre.
  @Patch(':id/revert-rejection')
  @Roles(Role.ADMIN)
  revertRejection(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.reservationsService.revertRejection(id, user, ip);
  }

  // POST /api/reservations/:id/propose-reassignment
  @Post(':id/propose-reassignment')
  @Roles(Role.ADMIN, Role.OPERATOR)
  proposeReassignment(
    @Param('id') id: string,
    @Body() dto: ProposeReassignmentDto,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.reservationsService.proposeReassignment(id, dto, user, ip);
  }

  // POST /api/reservations/:id/accept-reassignment.
  @Post(':id/accept-reassignment')
  acceptReassignment(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.reservationsService.acceptReassignment(id, user, ip);
  }

  // POST /api/reservations/:id/reject-reassignment 
  @Post(':id/reject-reassignment')
  rejectReassignment(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
    @Ip() ip: string,
  ) {
    return this.reservationsService.rejectReassignment(id, user, ip);
  }

  // PATCH /api/reservations/:id/cancel - el ciudadadno cancela su reserva
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.reservationsService.cancel(id, user.id);
  }
}
