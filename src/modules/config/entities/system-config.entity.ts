import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('system_config')
export class SystemConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Ejemplos: 'payment_window_hours', 'advance_booking_days', 'max_courts_per_day'
  @Index({ unique: true })
  @Column({ unique: true })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'updated_by' })
  updatedBy: User;

  @Column({ name: 'updated_by', nullable: true })
  updatedById: string;
}
