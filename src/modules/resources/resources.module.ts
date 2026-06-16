import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourcesController } from './resources.controller';
import { ResourcesService } from './resources.service';
import { Resource } from './entities/resource.entity';
import { ResourceSchedule } from './entities/resource-schedule.entity';
import { ResourceException } from './entities/resource-exception.entity';
import { Reservation } from '../reservations/entities/reservation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Resource,
      ResourceSchedule,
      ResourceException,
      Reservation,
    ]),
  ],
  controllers: [ResourcesController],
  providers: [ResourcesService],
  exports: [ResourcesService],
})
export class ResourcesModule {}
