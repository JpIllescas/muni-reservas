import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Role } from '../../../common/enums/role.enum';

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

  @Column({ nullable: true })
  phone: string;

  @Column({ type: 'enum', enum: Role, default: Role.CITIZEN })
  role: Role;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
