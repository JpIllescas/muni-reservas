import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

// Catálogo de estados operativos del recurso (REC-2, escalable). Reemplaza al
// enum fijo available/maintenance/event: el admin agrega estados nuevos (ej.
// "Reservado por liga") sin tocar código. El comportamiento cuelga de flags, no
// del nombre: `blocksReservations` decide si el recurso acepta reservas nuevas.
//
// `key` es el identificador ESTABLE al que apunta `resources.status` (FK). Es
// inmutable una vez creado (no hay ON UPDATE CASCADE): se fija al crear y no se
// edita. La etiqueta visible (`label`) sí es editable.
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

  // Flag de comportamiento: si es true, el recurso en este estado NO admite
  // reservas nuevas (create / revert / reassign lo rechazan). Se lee en vivo, así
  // que cambiarlo afecta de inmediato a todos los recursos en ese estado.
  @Column({ name: 'blocks_reservations', default: false })
  blocksReservations: boolean;

  // Columna latente (escalabilidad futura): visibilidad en el catálogo público.
  // Sembrada en true; hoy NINGÚN consumidor la filtra (no se expone para editar
  // hasta que se conecte el filtrado, para no dejar un control que no hace nada).
  @Column({ name: 'visible_in_catalog', default: true })
  visibleInCatalog: boolean;

  // Estado por defecto de un recurso nuevo. La fuente de verdad real es el DEFAULT
  // de la columna resources.status ('available'); este flag es la pista de UI que
  // lo espeja. Sembrado solo en 'available'; no editable.
  @Column({ name: 'is_default', default: false })
  isDefault: boolean;

  // Color (hex) para el chip en el panel. null = neutro.
  @Column({ type: 'varchar', nullable: true })
  color: string | null;

  // Inactivo = ya no se puede elegir para un recurso, pero se conserva (los
  // recursos que aún lo referencian siguen resolviéndolo por historial).
  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
