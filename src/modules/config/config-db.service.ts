import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemConfig } from './entities/system-config.entity';
import { UpdateConfigDto } from './dto/update-config.dto';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class ConfigDbService {
  constructor(
    @InjectRepository(SystemConfig)
    private readonly configRepository: Repository<SystemConfig>,

    private readonly auditService: AuditService,
  ) {}

  // Obtener todas las configuraciones del sistema (Admin)
  async findAll() {
    return this.configRepository.find({
      order: { key: 'ASC' }
    });
  }

  // Obtener un valor especifico por su llave (Ej: 'max_advance_day')
  async findByKey(key: string) {
    const config = await this.configRepository.findOne({ where: { key} });
    if (!config) {
      throw new NotFoundException(`Configuración con llave '${key}' no encontrada.`);
    }
    return config;
  }

  // Actualizar un valor de configuracion (Solo Admin)
  async update(key: string, dto: UpdateConfigDto, userId: string) {
    const config = await this.findByKey(key);

    // Guardamos el valor viejo para la auditoria 
    const oldValue = { value: config.value, description: config.description };

    config.value = dto.value;
    if (dto.description !== undefined) {
      config.description = dto.description;
    }
    config.updatedById = userId;

    const savedConfig = await this.configRepository.save(config);

    // dejamos ratstro en el log de auditoria 
    await this.auditService.createLog(
      'system_config', // entidad afectada
      'UPDATE',        // Accion
      userId,          // Quien lo hizo 
      savedConfig.id,  // ID del registro
      oldValue,        // valor antes
      { value: savedConfig.value, description: savedConfig.description } // Valor nuevo
    );

    return savedConfig;
  }
}