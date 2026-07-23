import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// Catálogo de estados operativos del recurso
@Entity('resource_statuses')
export class ResourceStatusEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Slug estable (lowercase, sin espacios). Destino del FK resources.status.
  @Index({ unique: true })
  @Column({ type: 'varchar' })
  key: string;

  // Texto visible (admin y ciudadano). Editable.
  @Column({ type: 'varchar' })
  label: string;

  // Flag de comportamiento: si es true, el recurso en este estado NO admite reservas nuevas
  @Column({ name: 'blocks_reservations', default: false })
  blocksReservations: boolean;

  // Columna latente (escalabilidad futura): visibilidad en el catálogo público.
  @Column({ name: 'visible_in_catalog', default: true })
  visibleInCatalog: boolean;

  // Estado por defecto de un recurso nuevo.
  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  // Color (hex) para el chip en el panel. null = neutro.
  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  // Inactivo = ya no se puede elegir para un recurso, pero se conserva (los recursos que aún lo referencian siguen resolviéndolo por historial).
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
