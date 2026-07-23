import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Resource } from './resource.entity';
import { User } from '../../users/entities/user.entity';

// Horario especial / override por fecha concreta. Gana sobre el horario semanal
@Entity('resource_schedule_overrides')
export class ResourceScheduleOverride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @Column({ name: 'resource_id' })
  resourceId: string;

  @Column({ name: 'override_date', type: 'date' })
  overrideDate: string;

  // Para CANCHAS estas horas se enforçan (la franja debe caer dentro).
  @Column({ name: 'open_time', type: 'time' })
  openTime: string;

  @Column({ name: 'close_time', type: 'time' })
  closeTime: string;

  // Como en ResourceSchedule: minutos por franja en canchas; null para ranchos.
  @Column({ name: 'slot_duration_min', type: 'int', nullable: true })
  slotDurationMin: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column({ name: 'created_by_id', nullable: true })
  createdById: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
