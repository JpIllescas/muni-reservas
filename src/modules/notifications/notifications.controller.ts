import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PaginationDto } from '../../common/dto/pagination.dto';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

// CR-2: apartado de notificaciones. Cada usuario autenticado ve y gestiona
// SOLO las suyas (el servicio filtra por userId), sin distinción de rol: hoy
// las reciben admins/operadores, pero el diseño sirve para cualquier usuario.
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // GET /api/notifications - mis notificaciones, más recientes primero
  @Get()
  findMine(@CurrentUser() user: AuthUser, @Query() dto: PaginationDto) {
    return this.notificationsService.findMyNotifications(
      user.id,
      dto.page,
      dto.limit,
    );
  }

  // GET /api/notifications/unread-count - para el badge de la campanita
  @Get('unread-count')
  unreadCount(@CurrentUser() user: AuthUser) {
    return this.notificationsService.getUnreadCount(user.id);
  }

  // PATCH /api/notifications/read-all - marcar todas como leídas
  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: AuthUser) {
    return this.notificationsService.markAllAsRead(user.id);
  }

  // PATCH /api/notifications/:id/read - marcar una como leída
  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.notificationsService.markAsRead(id, user.id);
  }
}
