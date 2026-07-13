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

// CR-2: notificación EN el sistema (apartado de notificaciones). Hoy la genera
// una reserva que entra "por autorizar" (aviso a admins/operadores de la sede),
// pero la tabla es genérica: cualquier aviso futuro a cualquier usuario.
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

  // Discriminador para que el front pueda enrutar/iconear (p. ej.
  // 'reservation_pending_review'). String plano, sin enum de BD: agregar tipos
  // nuevos no debe exigir migración.
  @Column()
  type: string;

  @Column()
  title: string;

  @Column({ type: 'text' })
  message: string;

  // Referencia plana a la reserva que la originó (sin FK, mismo criterio que
  // proposed_by/contact_*: si la reserva se borra, la notificación sobrevive).
  @Column({ name: 'reservation_id', type: 'uuid', nullable: true })
  reservationId: string | null;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
