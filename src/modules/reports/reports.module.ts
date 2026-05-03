import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Resource } from '../resources/entities/resource.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Reservation, Resource])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}