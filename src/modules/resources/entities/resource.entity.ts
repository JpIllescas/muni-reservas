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

  // Ubicación INTERNA dentro de la sede (ej. "Cancha 2, nivel superior").
  @Column({ nullable: true })
  location: string;

  // Sede a la que pertenece el recurso. NOT NULL: todo recurso vive en una sede. El filtrado admin/operador por sede cuelga de esta relación.
  @ManyToOne(() => Sede, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'sede_id' })
  sede: Sede;

  @Index()
  @Column({ name: 'sede_id' })
  sedeId: string;

  @Column({ nullable: true })
  capacity: number;

  // Las columnas decimal de Postgres vuelven como string en TypeORM; el transformer las convierte a number al leer (igual que Reservation.totalAmount).
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
  @Column({
    name: 'max_duration_minutes',
    type: 'int',
    nullable: true,
    default: 180,
  })
  maxDurationMinutes: number | null;

  // Ventana de pago en horas plazo para subir la boleta antes de que la reserva expire. Configurable por la administración. Solo aplica a canchas
  @Column({ name: 'payment_window_hours', type: 'int', default: 2 })
  paymentWindowHours: number;

  // ¿exige boleta de pago para aprobar? true (default) = flujo normal (subir boleta → revisión → aprobar). false = confirmación por llamada
  @Column({ name: 'requires_voucher', default: true })
  requiresVoucher: boolean;

  // horas que tiene la administración para dar la 1ª confirmación antes de que el cron expire una reserva en pending_confirmation y libere el slot.
  @Column({ name: 'confirmation_window_hours', type: 'int', default: 24 })
  confirmationWindowHours: number;

  // minutos que tiene la administración para validar una boleta.
  @Column({ name: 'validation_window_minutes', type: 'int', default: 60 })
  validationWindowMinutes: number;

  // estado operativo (catálogo resource_statuses). Guarda la `key` del estado (FK -> resource_statuses.key).
  @Column({ type: 'varchar', default: 'available' })
  status: string;

  // Motivo del estado (ej. "Cancha cerrada por torneo X"). null cuando está available. Se muestra al ciudadano en la disponibilidad.
  @Column({ name: 'status_reason', type: 'text', nullable: true })
  statusReason: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
