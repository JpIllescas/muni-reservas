import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Catálogo de motivos de rechazo (Aun en proceso)
@Entity('rejection_reasons')
export class RejectionReason {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Texto que ve el operador/admin al elegir el motivo.
  @Column({ name: 'label_admin', type: 'varchar' })
  labelAdmin: string;

  // Texto que ve el ciudadano (en el sistema y en el correo).
  @Column({ name: 'message_citizen', type: 'text' })
  messageCitizen: string;

  // Inactivo = ya no aparece para elegir, pero se conserva por historial/reportes.
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
