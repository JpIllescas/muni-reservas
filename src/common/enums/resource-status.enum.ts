// REC-2: estado operativo del recurso, SEPARADO de `isActive`.
export enum ResourceStatus {
  AVAILABLE = 'available',
  MAINTENANCE = 'maintenance',
  EVENT = 'event',
}
