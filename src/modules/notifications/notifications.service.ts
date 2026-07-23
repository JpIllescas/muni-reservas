import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Resource } from '../resources/entities/resource.entity';
import { User } from '../users/entities/user.entity';
import { Notification } from './entities/notification.entity';
import { Role } from '../../common/enums/role.enum';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly mailerService: MailerService,

    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  // 'YYYY-MM-DD' → 'DD/MM/YYYY' SIN pasar por Date: new Date('YYYY-MM-DD') es
  // medianoche UTC y getDate() local (GT = UTC-6) devolvía el día ANTERIOR.
  private formatISODate(isoDate: string): string {
    const [year, month, day] = isoDate.split('-');
    return `${day}/${month}/${year}`;
  }

  // 'HH:MM:SS' (columna time de Postgres) → 'HH:MM'.
  private formatTime(time: string): string {
    return time.slice(0, 5);
  }

  async sendOtpEmail(to: string, fullName: string, code: string) {
    try {
      await this.mailerService.sendMail({
        to,
        subject: 'Tu codigo de acceso - Reservas Muni Antigua',
        template: './otp', // Busca otp.hbs en la carpeta de templates
        context: {
          fullName,
          code,
          year: new Date().getFullYear(),
        },
      });
      this.logger.log(`Correo OTP enviado exitosamente a: ${to}`);
    } catch (error) {
      this.logger.error(`Error al enviar correo OTP a ${to}:`, error);
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException(
          'No pudimos enviar el código por correo. Intenta de nuevo en unos minutos.',
        );
      }
    }
  }

  // Se agregara aca sendReservationStatusEmail()
  async sendReservationStatusEmail(
    user: User,
    reservation: Reservation,
    newStatus: string,
    rejectionReason?: string,
  ) {
    try {
      const formattedDate = this.formatISODate(reservation.reservationDate);

      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Actualizacion de tu Reserva - Muni Antigua',
        template: './reservation-status', // Busca reservation-status.hbs
        context: {
          fullName: user.fullName,
          resourceName: reservation.resource
            ? reservation.resource.name
            : 'Recurso reservado',
          reservationDate: formattedDate,
          newStatus: newStatus,
          rejectionReason: rejectionReason,
          year: new Date().getFullYear(),
        },
      });
      this.logger.log(`Correo de estado de reserva enviado a: ${user.email}`);
    } catch (error) {
      this.logger.error(
        `Error al enviar correo de reserva a ${user.email}:`,
        error,
      );
    }
  }

  // aviso al ciudadano de que la administración propone mover su reserva
  async sendReassignmentProposalEmail(user: User, reservation: Reservation) {
    try {
      await this.mailerService.sendMail({
        to: user.email,
        subject: 'Propuesta de cambio de horario - Reservas Muni Antigua',
        template: './reassignment-proposal', // Busca reassignment-proposal.hbs
        context: {
          fullName: user.fullName,
          resourceName: reservation.resource
            ? reservation.resource.name
            : 'Recurso reservado',
          currentDate: this.formatISODate(reservation.reservationDate),
          currentTime: reservation.startTime
            ? `${this.formatTime(reservation.startTime)} - ${this.formatTime(reservation.endTime!)}`
            : null,
          proposedDate: this.formatISODate(reservation.proposedDate!),
          proposedTime: reservation.proposedStartTime
            ? `${this.formatTime(reservation.proposedStartTime)} - ${this.formatTime(reservation.proposedEndTime!)}`
            : null,
          reason: reservation.proposedReason,
          year: new Date().getFullYear(),
        },
      });
      this.logger.log(
        `Correo de propuesta de reasignación enviado a: ${user.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Error al enviar correo de reasignación a ${user.email}:`,
        error,
      );
    }
  }

  private async findAdminRecipients(
    sedeId: string,
    excludeUserId?: string,
  ): Promise<User[]> {
    const query = this.userRepository
      .createQueryBuilder('u')
      .leftJoin('u.sedes', 's')
      .where('u.isActive = true')
      .andWhere(
        '(u.isSuperAdmin = true OR (u.role IN (:...roles) AND s.id = :sedeId))',
        { roles: [Role.ADMIN, Role.OPERATOR], sedeId },
      )
      .distinct(true);

    if (excludeUserId) {
      query.andWhere('u.id != :excludeUserId', { excludeUserId });
    }

    return query.getMany();
  }

  async notifyReservationPendingReview(
    reservation: Reservation,
    resource: Resource,
    excludeUserId?: string,
  ) {
    try {
      const recipients = await this.findAdminRecipients(
        resource.sedeId,
        excludeUserId,
      );
      if (recipients.length === 0) {
        return;
      }

      const date = this.formatISODate(reservation.reservationDate);
      const time = reservation.startTime
        ? `${this.formatTime(reservation.startTime)} - ${this.formatTime(reservation.endTime!)}`
        : null;
      const message = `El recurso "${resource.name}" tiene una reserva para el ${date}${time ? ` (${time})` : ' (día completo)'
        } pendiente de revisión.`;

      // 1) Notificación EN el sistema, una por destinatario.
      const rows = recipients.map((recipient) =>
        this.notificationRepository.create({
          userId: recipient.id,
          type: 'reservation_pending_review',
          title: 'Reserva por autorizar',
          message,
          reservationId: reservation.id,
        }),
      );
      await this.notificationRepository.save(rows);

      // 2) Correo a cada destinatario (cada envío silencioso por separado: un SMTP caído no debe frenar las notificaciones en el sistema, que ya quedaron guardadas).
      for (const recipient of recipients) {
        try {
          await this.mailerService.sendMail({
            to: recipient.email,
            subject: 'Reserva por autorizar - Reservas Muni Antigua',
            template: './admin-new-reservation', // Busca admin-new-reservation.hbs
            context: {
              fullName: recipient.fullName,
              resourceName: resource.name,
              reservationDate: date,
              reservationTime: time,
              year: new Date().getFullYear(),
            },
          });
        } catch (error) {
          this.logger.error(
            `Error al enviar aviso de reserva por autorizar a ${recipient.email}:`,
            error,
          );
        }
      }
      this.logger.log(
        `Aviso de reserva por autorizar (${reservation.id}) a ${recipients.length} destinatario(s).`,
      );
    } catch (error) {
      this.logger.error(
        `Error al notificar reserva por autorizar (${reservation.id}):`,
        error,
      );
    }
  }

  // ==========================================================================
  // Apartado de notificaciones: cada usuario ve y gestiona las suyas.
  // ==========================================================================

  async findMyNotifications(userId: string, page = 1, limit = 10) {
    const [data, total] = await this.notificationRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async getUnreadCount(userId: string) {
    const count = await this.notificationRepository.count({
      where: { userId, isRead: false },
    });
    return { count };
  }

  async markAsRead(id: string, userId: string) {
    // Se busca por id + dueño: una notificación ajena da el mismo NotFound que una inexistente (no filtra si el id existe).
    const notification = await this.notificationRepository.findOne({
      where: { id, userId },
    });
    if (!notification) {
      throw new NotFoundException('Notificación no encontrada.');
    }
    if (!notification.isRead) {
      notification.isRead = true;
      await this.notificationRepository.save(notification);
    }
    return notification;
  }

  async markAllAsRead(userId: string) {
    const result = await this.notificationRepository.update(
      { userId, isRead: false },
      { isRead: true },
    );
    return { updated: result.affected ?? 0 };
  }
}
