import { EntityManager } from 'typeorm';
import { ResourceSchedule } from '../entities/resource-schedule.entity';
import { ResourceScheduleOverride } from '../entities/resource-schedule-override.entity';
import { dayOfWeekFromISODate } from '../../../common/utils/date.utils';

// Resuelve el horario EFECTIVO de un recurso para una fecha concreta.
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
