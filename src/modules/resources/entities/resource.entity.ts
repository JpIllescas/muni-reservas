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
import { ResourceStatus } from '../../../common/enums/resource-status.enum';
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
  // Texto libre informativo: la dirección/lugar real del complejo vive en la
  // entidad Sede (decisión: se conserva redefinida, no se elimina).
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
  @Column({
    name: 'max_duration_minutes',
    type: 'int',
    nullable: true,
    default: 180,
  })
  maxDurationMinutes: number | null;

  // Ventana de pago en horas (POL-1): plazo para subir la boleta antes de que la
  // reserva expire. Configurable por la administración. Solo aplica a canchas
  // (los ranchos pagan el día que llegan → paymentDeadline null). Default 24 =
  // comportamiento previo hardcodeado.
  @Column({ name: 'payment_window_hours', type: 'int', default: 24 })
  paymentWindowHours: number;

  // FLO-1: ¿exige boleta de pago para aprobar? true (default) = flujo normal
  // (subir boleta → revisión → aprobar). false = confirmación por llamada
  // (Florencia): el admin aprueba directo sin boleta y la reserva no auto-expira.
  @Column({ name: 'requires_voucher', default: true })
  requiresVoucher: boolean;

  // REC-2: estado operativo (mantenimiento / evento). NOT NULL default available.
  // Separado de isActive: un recurso en mantenimiento sigue activo y visible en el
  // catálogo (etiquetado), pero no admite reservas nuevas.
  @Column({
    type: 'enum',
    enum: ResourceStatus,
    default: ResourceStatus.AVAILABLE,
  })
  status: ResourceStatus;

  // Motivo del estado (ej. "Cancha cerrada por torneo X"). null cuando está
  // available. Se muestra al ciudadano en la disponibilidad.
  @Column({ name: 'status_reason', type: 'text', nullable: true })
  statusReason: string | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
