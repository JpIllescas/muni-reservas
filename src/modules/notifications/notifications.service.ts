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

  // RES-3: aviso al ciudadano de que la administración propone mover su reserva
  // a otro horario, con instrucción de entrar al sistema a aceptar o rechazar.
  // Silencioso si falla (igual que sendReservationStatusEmail): la propuesta ya
  // quedó persistida y el ciudadano también la ve dentro del sistema.
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
}
