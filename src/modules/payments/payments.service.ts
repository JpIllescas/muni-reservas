import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { Reservation } from '../reservations/entities/reservation.entity';
import { ReservationLog } from '../reservations/entities/reservation-log.entity';
import { PaymentStatus } from '../../common/enums/payment-status.enum';
import { ReservationStatus } from '../../common/enums/reservation-status.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { Role } from '../../common/enums/role.enum';
import { UploadVoucherDto } from './dto/upload-voucher.dto';
import { AdminUploadVoucherDto } from './dto/admin-upload-voucher.dto';
import { promises as fs } from 'fs';
import { resolve, sep } from 'path';
import { detectFileType } from '../../common/utils/file-signature.utils';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';
import { assertSedeAccess } from '../../common/utils/sede-scope.util';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,

    private readonly dataSource: DataSource,

    // AuditModule es @Global: se inyecta sin importar el módulo.
    private readonly auditService: AuditService,

    // CR-2: aviso a los admins cuando una reserva entra a revisión.
    private readonly notificationsService: NotificationsService,
  ) {}

  async uploadVoucher(
    reservationId: string,
    userId: string,
    file: Express.Multer.File,
    dto: UploadVoucherDto,
  ) {
    if (!file) {
      throw new BadRequestException(
        'La imagen oPDF de la boleta es requerido.',
      );
    }

    const realType = await detectFileType(file.path);

    if (!realType) {
      await fs.unlink(file.path).catch(() => undefined);
      throw new BadRequestException(
        'El archivo no es una imagen (JPG/PNG) ni un PDF valido.',
      );
    }

    // CR-2: referencia para el aviso a admins post-commit.
    let notifyReservation: Reservation | null = null;

    // --- Try/catch envolviendo la transacción ---
    let result: { message: string };
    try {
      result = await this.dataSource.transaction(async (manager) => {
        // Con resource: para el aviso a los admins de la sede (CR-2).
        const reservation = await manager.findOne(Reservation, {
          where: { id: reservationId, userId },
          relations: ['resource'],
        });

        if (!reservation) {
          throw new NotFoundException('Reserva no encontrada o no pertenece.');
        }

        if (reservation.status !== ReservationStatus.PENDING_PAYMENT) {
          throw new BadRequestException(
            `No puedes subir boleta. La reserva está en estado: ${reservation.status}`,
          );
        }

        const payment = manager.create(Payment, {
          reservationId: reservation.id,
          method: PaymentMethod.VOUCHER,
          status: PaymentStatus.PENDING,
          voucherPath: file.path,
          voucherOriginalName: file.originalname,
          voucherSizeBytes: file.size,
          transactionReference: dto.transactionReference,
          notes: dto.notes,
          submittedAt: new Date(),
        });

        await manager.save(payment);

        reservation.status = ReservationStatus.UNDER_REVIEW;
        await manager.save(reservation);

        const log = new ReservationLog();
        log.reservationId = reservation.id;
        log.fromStatus = ReservationStatus.PENDING_PAYMENT;
        log.toStatus = ReservationStatus.UNDER_REVIEW;
        log.changedById = userId;
        log.reason = 'El ciudadano subió su boleta de pago.';

        await manager.save(log);

        notifyReservation = reservation;
        return {
          message: 'Boleta subida exitosamente. La reserva está bajo revisión.',
        };
      });
    } catch (error) {
      // La transacción hizo rollback en la BD, pero el archivo sigue en disco (se borra)
      await fs.unlink(file.path).catch(() => undefined);
      throw error;
    }

    // CR-2: la reserva entró a revisión → aviso a los admins de la sede.
    // FUERA de la transacción y best-effort (no toca el pago ya commiteado).
    if (notifyReservation) {
      await this.notificationsService.notifyReservationPendingReview(
        notifyReservation,
        (notifyReservation as Reservation).resource,
      );
    }

    return result;
  }

  // CR-5: el ciudadano pagó EN EFECTIVO en la cancha y el admin/operador sube
  // la boleta en su nombre. Mismo flujo que uploadVoucher (magic bytes, tx,
  // limpieza de huérfanos, pasa a under_review) pero con gating de sede (ADM-1),
  // método cash, número de boleta obligatorio y auditoría de la acción admin.
  // La aprobación sigue siendo updateStatus: la máquina de estados no cambia.
  async uploadVoucherByAdmin(
    reservationId: string,
    actor: AuthUser,
    file: Express.Multer.File,
    dto: AdminUploadVoucherDto,
    ipAddress?: string,
  ) {
    if (!file) {
      throw new BadRequestException(
        'La imagen o PDF de la boleta es requerido.',
      );
    }

    const realType = await detectFileType(file.path);

    if (!realType) {
      await fs.unlink(file.path).catch(() => undefined);
      throw new BadRequestException(
        'El archivo no es una imagen (JPG/PNG) ni un PDF valido.',
      );
    }

    // CR-2: referencia para el aviso a admins post-commit.
    let notifyReservation: Reservation | null = null;

    let result: { message: string };
    try {
      result = await this.dataSource.transaction(async (manager) => {
        // Con resource para el chequeo de sede; sin filtrar por userId (la
        // reserva es del ciudadano, no del actor).
        const reservation = await manager.findOne(Reservation, {
          where: { id: reservationId },
          relations: ['resource'],
        });

        if (!reservation) {
          throw new NotFoundException('Reserva no encontrada.');
        }

        // Admin/operador solo registra pagos de recursos de sus sedes (ADM-1).
        if (!actor.isSuperAdmin) {
          assertSedeAccess(actor, reservation.resource.sedeId);
        }

        if (reservation.status !== ReservationStatus.PENDING_PAYMENT) {
          throw new BadRequestException(
            `No se puede registrar el pago. La reserva está en estado: ${reservation.status}`,
          );
        }

        const payment = manager.create(Payment, {
          reservationId: reservation.id,
          method: PaymentMethod.CASH,
          status: PaymentStatus.PENDING,
          voucherPath: file.path,
          voucherOriginalName: file.originalname,
          voucherSizeBytes: file.size,
          transactionReference: dto.transactionReference,
          notes: dto.notes,
          submittedAt: new Date(),
        });

        await manager.save(payment);

        reservation.status = ReservationStatus.UNDER_REVIEW;
        await manager.save(reservation);

        const log = new ReservationLog();
        log.reservationId = reservation.id;
        log.fromStatus = ReservationStatus.PENDING_PAYMENT;
        log.toStatus = ReservationStatus.UNDER_REVIEW;
        log.changedById = actor.id;
        log.reason = `Pago en efectivo registrado por administración (boleta N° ${dto.transactionReference}).`;

        await manager.save(log);

        notifyReservation = reservation;
        return {
          message:
            'Pago en efectivo registrado. La reserva está bajo revisión.',
        };
      });
    } catch (error) {
      // La transacción hizo rollback en la BD, pero el archivo sigue en disco (se borra)
      await fs.unlink(file.path).catch(() => undefined);
      throw error;
    }

    // Auditoría de la acción administrativa, FUERA del try/catch: si fallara,
    // el pago ya está commiteado y el archivo NO debe borrarse.
    await this.auditService.createLog(
      'Payment',
      'ADMIN_UPLOAD_VOUCHER',
      actor.id,
      reservationId,
      { status: ReservationStatus.PENDING_PAYMENT },
      {
        status: ReservationStatus.UNDER_REVIEW,
        method: PaymentMethod.CASH,
        transactionReference: dto.transactionReference,
      },
      ipAddress,
    );

    // CR-2: la reserva entró a revisión → aviso a los admins de la sede,
    // excluyendo al actor (él mismo registró el pago). Best-effort.
    if (notifyReservation) {
      await this.notificationsService.notifyReservationPendingReview(
        notifyReservation,
        (notifyReservation as Reservation).resource,
        actor.id,
      );
    }

    return result;
  }

  async getPaymentByReservation(reservationId: string, user: AuthUser) {
    // 1. Buscamos la reserva (con su recurso) para verificar la autorización.
    const reservation = await this.reservationRepository.findOne({
      where: { id: reservationId },
      relations: ['resource'],
    });

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada.');
    }

    // 2. Autorización: el ciudadano solo ve la suya; admin/operador solo las de
    //    sus sedes (ADM-1); el super-admin, cualquiera.
    if (user.role === Role.CITIZEN) {
      if (reservation.userId !== user.id) {
        throw new ForbiddenException(
          'No tienes permiso para ver los detalles de pago de esta reserva.',
        );
      }
    } else {
      assertSedeAccess(user, reservation.resource.sedeId);
    }

    // 3. Si pasó la seguridad, buscamos el pago
    const payment = await this.paymentRepository.findOne({
      where: { reservationId },
      order: { submittedAt: 'DESC' },
    });

    if (!payment) {
      throw new NotFoundException(
        'No hay pagos registrados para esta reserva.',
      );
    }

    return payment;
  }

  // Develve la ruta fisica + metadatos de la boleta, ya autorizada.
  async getVoucherFile(reservationId: string, user: AuthUser) {
    const payment = await this.getPaymentByReservation(reservationId, user);

    if (!payment.voucherPath) {
      throw new NotFoundException('Esta reserva no tiene una boleta adjunta.');
    }

    const uploadsDir = resolve(process.env.UPLOAD_PATH || './uploads');
    const absPath = resolve(payment.voucherPath);
    if (!absPath.startsWith(uploadsDir + sep)) {
      throw new NotFoundException('Boleta no encontrada.');
    }

    // ¿Sigue el archivo en disco?
    try {
      await fs.access(absPath);
    } catch {
      throw new NotFoundException(
        'El archivo de la boleta ya no está disponible.',
      );
    }

    // Content-type por magic bytes
    const realType = await detectFileType(absPath);
    const contentType =
      realType === 'pdf'
        ? 'application/pdf'
        : realType === 'png'
          ? 'image/png'
          : realType === 'jpg'
            ? 'image/jpeg'
            : 'application/octet-stream';

    const fileName = (payment.voucherOriginalName || 'boleta').replace(
      /[^\w.\- ]/g,
      '_',
    );

    return { path: absPath, contentType, fileName };
  }
}
