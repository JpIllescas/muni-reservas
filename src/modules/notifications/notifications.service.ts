import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { Reservation } from '../reservations/entities/reservation.entity';
import { User } from '../users/entities/user.entity';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly mailerService: MailerService) {}

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
      // Formatear la fecha para que se vea bien
      const dateObj = new Date(reservation.reservationDate);
      const formattedDate = `${dateObj.getDate().toString().padStart(2, '0')}/${(dateObj.getMonth() + 1).toString().padStart(2, '0')}/${dateObj.getFullYear()}`;

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
}
