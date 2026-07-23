import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RejectionReason } from './entities/rejection-reason.entity';
import { RejectionReasonsController } from './rejection-reasons.controller';
import { RejectionReasonsService } from './rejection-reasons.service';

@Module({
  imports: [TypeOrmModule.forFeature([RejectionReason])],
  controllers: [RejectionReasonsController],
  providers: [RejectionReasonsService],
  // Exportado para que ReservationsService resuelva el motivo al rechazar.
  exports: [RejectionReasonsService],
})
export class RejectionReasonsModule {}
