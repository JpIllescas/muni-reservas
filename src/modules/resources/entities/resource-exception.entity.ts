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

@Entity('resource_exceptions')
export class ResourceException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Resource, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'resource_id' })
  resource: Resource;

  @Column({ name: 'resource_id' })
  resourceId: string;

  @Column({ name: 'exception_date', type: 'date' })
  exceptionDate: Date;

  @Column({ type: 'text' })
  reason: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: User;

  @Column({ name: 'created_by_id', nullable: true })
  createdById: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
