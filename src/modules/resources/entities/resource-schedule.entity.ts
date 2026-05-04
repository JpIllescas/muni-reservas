import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Resource } from './resource.entity';

@Entity('resource_schedules')
export class ResourceSchedule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Resource)
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @Column({ name: 'resource_id' })
  resourceId: string;

  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek: number;

  @Column({ name: 'open_time', type: 'time' })
  openTime: string;

  @Column({ name: 'close_time', type: 'time' })
  closeTime: string;

  // En canchas será 60 minutos. En ranchos será null porque es día completo
  @Column({ name: 'slot_duration_min', nullable: true })
  slotDurationMin: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
