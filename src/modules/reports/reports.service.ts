import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Reservation } from '../reservations/entities/reservation.entity';
import { Resource } from '../resources/entities/resource.entity';
import type { AuthUser } from '../../common/interfaces/auth-user.interface';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Reservation)
    private readonly reservationRepository: Repository<Reservation>,

    @InjectRepository(Resource)
    private readonly resourceRepository: Repository<Resource>,
  ) {}

  // Acota un query de reservas a las sedes del actor (ADM-1). Devuelve false si
  // el actor no tiene acceso a ninguna sede (el caller debe responder vacío).
  private applySedeScope(
    qb: SelectQueryBuilder<Reservation>,
    user: AuthUser,
    resourceAlias: string,
  ): boolean {
    if (user.isSuperAdmin) {
      return true;
    }
    if (user.sedeIds.length === 0) {
      return false;
    }
    qb.andWhere(`${resourceAlias}.sedeId IN (:...sedeIds)`, {
      sedeIds: user.sedeIds,
    });
    return true;
  }

  // 1. Reporte: Cantidad de reservas agrupadas por su estado ( Aprobado, Pendiente, etc.)
  async getReservationsByStatus(user: AuthUser) {
    const query = this.reservationRepository
      .createQueryBuilder('reservation')
      .innerJoin('reservation.resource', 'resource')
      .select('reservation.status', 'status')
      .addSelect('COUNT(reservation.id)', 'count')
      .groupBy('reservation.status');

    if (!this.applySedeScope(query, user, 'resource')) {
      return [];
    }

    const result = await query.getRawMany<{ status: string; count: string }>();

    // Convertir el string 'count' que devuelve postgres a un numero real
    return result.map((item) => ({
      status: item.status,
      count: parseInt(item.count, 10),
    }));
  }

  // 2. Reporte: top de recursos (Canchas/Ranchos) con más reservas
  async getPopularResource(user: AuthUser) {
    const query = this.reservationRepository
      .createQueryBuilder('reservation')
      .innerJoinAndSelect('reservation.resource', 'resource')
      .select('resource.name', 'resourceName')
      .addSelect('resource.type', 'resourceType')
      .addSelect('COUNT(reservation.id)', 'reservationCount')
      .groupBy('resource.id')
      .orderBy('COUNT(reservation.id)', 'DESC')
      .limit(5); // Solo mostrar el top 5

    if (!this.applySedeScope(query, user, 'resource')) {
      return [];
    }

    const result = await query.getRawMany<{
      resourceName: string;
      resourceType: string;
      reservationCount: string;
    }>();

    return result.map((item) => ({
      resourceName: item.resourceName,
      resourceType: item.resourceType,
      reservationCount: parseInt(item.reservationCount, 10),
    }));
  }
}
