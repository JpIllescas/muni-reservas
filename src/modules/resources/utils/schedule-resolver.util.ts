import { EntityManager } from 'typeorm';
import { ResourceSchedule } from '../entities/resource-schedule.entity';
import { ResourceScheduleOverride } from '../entities/resource-schedule-override.entity';
import { dayOfWeekFromISODate } from '../../../common/utils/date.utils';

// REC-3 — Resuelve el horario EFECTIVO de un recurso para una fecha concreta.
// Precedencia: override por fecha (REC-3) > horario semanal por dayOfWeek. El
// bloqueo por excepción (REC-1) NO se resuelve aquí: en los 4 sitios de uso el
// guard de excepción corre ANTES, así que "fecha bloqueada" ya cortó el flujo y
// tiene mayor precedencia gratis. Devuelve null si el recurso no atiende ese día.
//
// Ambas entidades comparten openTime/closeTime/slotDurationMin, que es lo único
// que consumen los llamadores (validación de franja y display de disponibilidad).
export async function resolveEffectiveSchedule(
  manager: EntityManager,
  resourceId: string,
  date: string,
): Promise<ResourceSchedule | ResourceScheduleOverride | null> {
  const override = await manager.findOne(ResourceScheduleOverride, {
    where: { resourceId, overrideDate: date },
  });
  if (override) {
    return override;
  }

  const dayOfWeek = dayOfWeekFromISODate(date);
  return manager.findOne(ResourceSchedule, {
    where: { resourceId, dayOfWeek, isActive: true },
  });
}
