import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository, } from '@nestjs/typeorm';
import { Repository } from 'typeorm'
import { Payment } from './entities/payment.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ReservationLog } from '../reservations/entities/reservation-log.entity';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { ReservationStatus } from '../../common/enums/reservation-status.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { Role } from '../../common/enums/role.enum';
import { UploadVoucherDto } from './dto/upload-voucher.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,

    @InjectRepository(ReservationLog)
    private readonly LogRepository: Repository<ReservationLog>,
  ) {}

  async uploadVoucher(
    reservationId: string, 
    userId: string,
    file: Express.Multer.File,
    dto: UploadVoucherDto,
  ) {
    if (!file) {
        throw new BadRequestException('La imagen o PDF de la boleta es requerido.');
    }

    // 1. Buscar la reserva
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId, userId },
    });

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada o no te pertenece.');
    }

    // 2. Validar que esté pendiente de pago
    if (reservation.status !== ReservationStatus.PENDING_PAYMENT) {
      throw new BadRequestException(`No puedes subir boleta. La reserva está en estado: ${reservation.status}`);
    }

    // 3. Crear el registro de pago 
    const payment = this.paymentRepository.create({
      reservationId: reservation.id,
      method: PaymentMethod.VOUCHER,
      status: PaymentStatus.PENDING, // El pago está pendiente de revisión por el admin
      voucherPath: file.path,
      voucherOriginalName: file.originalname,
      voucherSizeBytes: file.size,
      transactionReference: dto.transactionReference,
      notes: dto.notes,
      submittedAt: new Date(),
    });

    await this.paymentRepository.save(payment);

    // 4. Actualizar la reserva a UNDER_REVIEW;
    reservation.status = ReservationStatus.UNDER_REVIEW;
    await this.reservationRepository.save(reservation);

    // 5. Dejar rastro en el log
    const log = new ReservationLog();
    log.reservationId = reservation.id;
    log.fromStatus = ReservationStatus.PENDING_PAYMENT
    log.toStatus = ReservationStatus.UNDER_REVIEW;
    log.changedById = userId;
    log.reason = 'El ciudadano subió su boleta de pago';
    await this.LogRepository.save(log);

    return {
      message: 'Boleta subida exitosamente. La reserva está bajo revisión.',
    };
  }

  async getPaymentByReservation(reservationId: string, userId: string, userRole: Role) {
    // 1. Primero buscamos la reserva para verificar quién es el dueño
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
    });

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }

    // 2. Verificamos si el usuario es un ciudadano y si está intentando ver una reserva que no es suya
    if (userRole === Role.CITIZEN && reservation.userId !== userId) {
      throw new ForbiddenException('No tienes permiso para ver los detalles de pago de esta reserva.');
    }

    // 3. Si pasó la seguridad, buscamos el pago
    const payment = await this.paymentRepository.findOne({
      where: { reservationId },
      order: { submittedAt: 'DESC' }, 
    });

    if (!payment) {
      throw new NotFoundException('No hay pagos registrados para esta reserva.');
    }
    
    return payment;
  }
}