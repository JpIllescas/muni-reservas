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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
