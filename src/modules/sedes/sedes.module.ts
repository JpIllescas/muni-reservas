import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SedesController } from './sedes.controller';
import { SedesService } from './sedes.service';
import { Sede } from '../resources/entities/sede.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Sede, User])],
  controllers: [SedesController],
  providers: [SedesService],
  exports: [SedesService],
})
export class SedesModule {}
