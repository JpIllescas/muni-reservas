import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

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
      // En desarrollo, no lanzamos excepcion para no bloquear si no hay internet
    }
  }
  // Se agregara aca sendReservationStatusEmail()
}