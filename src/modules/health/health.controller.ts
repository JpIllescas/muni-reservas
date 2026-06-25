import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

// Endpoint liviano para que el balanceador de AWS sepa si el servicio está vivo.
// Sin throttling: el health check se consulta con mucha frecuencia.
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // GET /api/health - estado del servicio y de la conexión a la BD
  @Get()
  async check() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch {
      // 503: el proceso vive pero la BD no responde → el balanceador no debe
      // enrutar tráfico a esta instancia.
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }

    return {
      status: 'ok',
      database: 'up',
      timestamp: new Date().toISOString(),
    };
  }
}
