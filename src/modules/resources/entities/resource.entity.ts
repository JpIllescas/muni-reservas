import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { ResourceType } from '../../../common/enums/resource-type.enum';
import { Sede } from './sede.entity';

@Entity('resources')
export class Resource {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: ResourceType })
  type: ResourceType;

  @Column({ nullable: true })
  location: string;

  // Sede a la que pertenece el recurso (ADM-1). NOT NULL: todo recurso vive en
  // una sede. El filtrado admin/operador por sede cuelga de esta relación.
  @ManyToOne(() => Sede, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sede_id' })
  sede: Sede;

  @Index()
  @Column({ name: 'sede_id' })
  sedeId: string;

  @Column({ nullable: true })
  capacity: number;

  // Las columnas decimal de Postgres vuelven como string en TypeORM; el
  // transformer las convierte a number al leer (igual que Reservation.totalAmount).
  @Column({
    name: 'price_per_unit',
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: {
      to: (value: number) => value,
      from: (value: string) => parseFloat(value),
    },
  })
  pricePerUnit: number;

  @Column({ nullable: true, type: 'text' })
  rules: string;

  @Column({ name: 'advance_days', default: 7 })
  advanceDays: number;

  // Tope de duración por reserva (solo aplica a canchas/COURT). null = sin tope.
  @Column({ name: 'max_duration_minutes', type: 'int', nullable: true, default: 180 })
  maxDurationMinutes: number | null;

  // Ventana de pago en horas (POL-1): plazo para subir la boleta antes de que la
  // reserva expire. Configurable por la administración. Solo aplica a canchas
  // (los ranchos pagan el día que llegan → paymentDeadline null). Default 24 =
  // comportamiento previo hardcodeado.
  @Column({ name: 'payment_window_hours', type: 'int', default: 24 })
  paymentWindowHours: number;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
