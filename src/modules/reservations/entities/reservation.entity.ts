import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Resource } from '../../resources/entities/resource.entity';
import { Payment } from '../../payments/entities/payment.entity';
import { ReservationStatus } from '../../../common/enums/reservation-status.enum';

@Entity('reservations')
@Index(['status', 'paymentDeadline']) // <--- para el CronJob
@Index(['resourceId', 'reservationDate']) // <--- Para cruces de horarios
@Index(['userId']) // <--- Para "Mis reservas"
export class Reservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @Column({ name: 'resource_id' })
  resourceId: string;

  @OneToMany(() => Payment, (payment) => payment.reservation)
  payments: Payment[];

  @Column({ name: 'reservation_date', type: 'date' })
  reservationDate: string;

  // Monto total calculado y persistido en el BACKEND (ARQ-1). El frontend solo
  // lo muestra; nunca lo calcula. Las columnas decimal de Postgres vuelven como
  // string en TypeORM, por eso el transformer las convierte a number al leer.
  @Column({
    name: 'total_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  totalAmount: number;

  // En ranchos estos dos campos son null porque es dia completo
  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime: string | null;

  @Column({
    type: 'enum',
    enum: ReservationStatus,
    default: ReservationStatus.PENDING_PAYMENT,
  })
  status: ReservationStatus;

  // Null en ranchos de Florencia porque pagan el dia que llegan
  @Column({ name: 'payment_deadline', type: 'timestamptz', nullable: true })
  paymentDeadline: Date | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ name: 'rejection_reason', nullable: true, type: 'text' })
  rejectionReason: string | null;

  // RES-2: datos de contacto del ENCARGADO de la reserva (a quién llamar/confirmar
  // el día del evento; puede no ser el titular de la cuenta). Obligatorios en el DTO
  // de creación; nullable en BD para no romper las reservas previas a RES-2.
  @Column({ name: 'contact_name', type: 'varchar', nullable: true })
  contactName: string | null;

  @Column({ name: 'contact_phone', type: 'varchar', nullable: true })
  contactPhone: string | null;

  // RES-3: propuesta de reasignación de horario (Shape B). El admin/operador
  // propone un nuevo slot aquí sin tocar el estado ni ocupar el horario nuevo;
  // solo tienen valor mientras hay una propuesta viva. Se limpian (a null) cuando
  // el ciudadano acepta (se mueven a los campos reales) o rechaza la propuesta.
  @Column({ name: 'proposed_date', type: 'date', nullable: true })
  proposedDate: string | null;

  @Column({ name: 'proposed_start_time', type: 'time', nullable: true })
  proposedStartTime: string | null;

  @Column({ name: 'proposed_end_time', type: 'time', nullable: true })
  proposedEndTime: string | null;

  // Admin/operador que emitió la propuesta. Columna plana (sin relación) para no
  // arrastrar un FK que synchronize crearía solo en dev y divergiría de la
  // migración a mano; igual criterio que contact_*.
  @Column({ name: 'proposed_by', type: 'uuid', nullable: true })
  proposedBy: string | null;

  @Column({ name: 'proposed_at', type: 'timestamptz', nullable: true })
  proposedAt: Date | null;

  // FLO-2: descuento por carta/oferta aplicado por un admin. `totalAmount`
  // SIEMPRE queda como el monto FINAL a pagar (ARQ-1: el front solo muestra);
  // estas columnas dejan constancia de cuánto se rebajó y por qué. El monto
  // original se reconstruye como totalAmount + discountAmount. `discount_applied_by`
  // es columna plana sin FK (mismo criterio que proposed_by/contact_*).
  @Column({
    name: 'discount_amount',
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    transformer: {
      to: (value: number | null) => value,
      from: (value: string | null) =>
        value === null ? null : parseFloat(value),
    },
  })
  discountAmount: number | null;

  @Column({ name: 'discount_reason', type: 'text', nullable: true })
  discountReason: string | null;

  @Column({ name: 'discount_applied_by', type: 'uuid', nullable: true })
  discountAppliedBy: string | null;

  @Column({ name: 'discount_applied_at', type: 'timestamptz', nullable: true })
  discountAppliedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
