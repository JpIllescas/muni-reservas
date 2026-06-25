// REC-2: estado operativo del recurso, SEPARADO de `isActive`. Un recurso en
// mantenimiento/evento sigue activo (aparece en el catálogo, etiquetado) pero no
// admite reservas nuevas. `isActive` es el on/off de ciclo de vida; esto es el
// estado del día a día.
export enum ResourceStatus {
  AVAILABLE = 'available',
  MAINTENANCE = 'maintenance',
  EVENT = 'event',
}
