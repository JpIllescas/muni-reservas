import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Role } from '../../../common/enums/role.enum';
import { Sede } from '../../resources/entities/sede.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name' })
  fullName: string;

  @Index({ unique: true })
  @Column({ unique: true })
  email: string;

  // Hash bcrypt. select:false => nunca se devuelve en queries normales;
  // en el login hay que pedirla explícitamente con addSelect/select.
  @Column({ select: false })
  password: string;

  @Column({ name: 'is_email_verified', default: false })
  isEmailVerified: boolean;

  @Column({ nullable: true, unique: true })
  dpi: string;

  // fotos del DPI (frente y reverso), subidas desde el perfil. Rutas del
  // filesystem (PII: /uploads está fuera de git). Junto con el número son
  // requisito para reservar (gate en ReservationsService.create).
  @Column({ name: 'dpi_front_path', type: 'varchar', nullable: true })
  dpiFrontPath: string | null;

  @Column({ name: 'dpi_back_path', type: 'varchar', nullable: true })
  dpiBackPath: string | null;

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'enum', enum: Role, default: Role.CITIZEN })
  role: Role;

  @Column({ name: 'is_super_admin', default: false })
  isSuperAdmin: boolean;

  // Sedes que este admin/operador puede gestionar. Vacío para ciudadanos.
  @ManyToMany(() => Sede)
  @JoinTable({
    name: 'user_sedes',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'sede_id', referencedColumnName: 'id' },
  })
  sedes: Sede[];

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
