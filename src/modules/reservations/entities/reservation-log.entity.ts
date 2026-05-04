import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Reservation } from './reservation.entity';
import { User } from '../../users/entities/user.entity';
import { ReservationStatus } from '../../../common/enums/reservation-status.enum';

@Entity('reservation_logs')
export class ReservationLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Reservation)
  @JoinColumn({ name: 'reservation_id' })
  reservation: Reservation;

  @Column({ name: 'reservation_id' })
  reservationId: string;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: ReservationStatus,
    nullable: true,
  })
  fromStatus: ReservationStatus | null;

  @Column({ name: 'to_status', type: 'enum', enum: ReservationStatus })
  toStatus: ReservationStatus;

  // Null si el cambio fue automatico, por ejemplo la expiracion de 24 horas
  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'changed_by' })
  changedBy: User;

  @Column({ name: 'changed_by', nullable: true })
  changedById: string | null;

  @Column({ nullable: true, type: 'text' })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
