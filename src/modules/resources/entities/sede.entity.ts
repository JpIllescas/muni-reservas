import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// Sede / Lugar físico de la municipalidad (ADM-1). Ej: Complejo Deportivo La
// Pólvora, Parque Ecológico Florencia. Es el cimiento del modelo multi-sede:
// cada Resource pertenece a una Sede, y los admins/operadores se acotan a una o
// varias sedes (M2M en User). Modelado para escalar a más lugares.
@Entity('sedes')
export class Sede {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true, type: 'text' })
  address: string;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
