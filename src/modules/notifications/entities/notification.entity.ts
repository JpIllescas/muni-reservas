import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

// notificación EN el sistema (apartado de notificaciones).
@Entity('notifications')
@Index(['userId', 'isRead']) // <--- para el contador de no leídas
@Index(['userId', 'createdAt']) // <--- para el listado propio
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Destinatario. Si se borra el usuario, sus notificaciones mueren con él.
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id' })
  userId: string;

  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  // Referencia a la reserva que la originó
  @Column({ name: 'reservation_id', type: 'uuid', nullable: true })
  reservationId: string | null;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
