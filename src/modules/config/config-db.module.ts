import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigDbController } from './config-db.controller';
import { ConfigDbService } from './config-db.service';
import { SystemConfig } from './entities/system-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfig])],
  controllers: [ConfigDbController],
  providers: [ConfigDbService],
  exports: [ConfigDbService],
})
export class ConfigDbModule {}