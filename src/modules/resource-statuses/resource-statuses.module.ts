import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ResourceStatusEntity } from './entities/resource-status.entity';
import { ResourceStatusesController } from './resource-statuses.controller';
import { ResourceStatusesService } from './resource-statuses.service';

@Module({
  imports: [TypeOrmModule.forFeature([ResourceStatusEntity])],
  controllers: [ResourceStatusesController],
  providers: [ResourceStatusesService],
  // Exportado para que ResourcesService valide/lea el estado.
  exports: [ResourceStatusesService, TypeOrmModule],
})
export class ResourceStatusesModule { }
