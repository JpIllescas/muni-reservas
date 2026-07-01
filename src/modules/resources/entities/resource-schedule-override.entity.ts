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

// REC-3 — Horario especial / override por fecha concreta. Gana sobre el horario
// semanal (ResourceSchedule) para ESA fecha: abre un día normalmente cerrado o
// cambia/estrecha las horas. NO sirve para CERRAR un día (eso es la excepción de
// REC-1, que además tiene mayor precedencia: fecha bloqueada > override > semanal).
// Una sola fila por recurso+fecha (validado en el service, como REC-1).
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

  // Para CANCHAS estas horas se enforçan (la franja debe caer dentro). Para
  // RANCHOS son cosméticas: el rancho es de día completo, no se validan horas —
  // el único efecto del override en un rancho es abrir un día normalmente cerrado.
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
