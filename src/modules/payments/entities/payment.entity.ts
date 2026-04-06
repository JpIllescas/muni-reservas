import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Reservation } from '../../reservations/entities/reservation.entity';
import { User } from '../../users/entities/user.entity';
import { PaymentMethod } from '../../../common/enums/payment-method.enum';
import { PaymentStatus } from '../../../common/enums/payment-status.enum';

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

 @ManyToOne(() => Reservation)
 @JoinColumn({ name: 'reservation_id' })
 
 @Column({ name: 'reservation_id' })
 reservationId: string;

 @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.VOUCHER })
 method: PaymentMethod;

 @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.PENDING })
 status: PaymentStatus;

 @Column({ name: 'voucher_path', nullable: true })
 voucherPath: string;

 @Column({ name: 'voucher_original_name', nullable: true })
 voucherOriginalName: string;

 @Column({ name: 'voucher_size_bytes', type: 'bigint', nullable: true })
 voucherSizeBytes: number;

 @Column({ name: 'submitted_at', type: 'timestamptz', nullable: true })
 submittedAt: Date;

 @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
 reviewedAt: Date;

 @ManyToOne(() => User, { nullable: true })
 @JoinColumn({ name: 'reviewed_by' })
 reviewedBy: User;

 @Column({ name: 'reviewed_by', nullable: true })
 reviewedById: string;

 @Column({ nullable: true, type: 'text' })
  notes: string;
}