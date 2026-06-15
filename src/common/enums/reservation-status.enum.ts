export enum ReservationStatus {
  PENDING_PAYMENT = 'pending_payment',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

// Estados "muertos": la reserva ya no ocupa el recurso. Se excluyen al buscar
// solapamientos / duplicados (deben coincidir con los backstops de BD:
// excl_court_overlap y uq_ranch_active_booking, que usan el set ACTIVO).
export const INACTIVE_RESERVATION_STATUSES: ReservationStatus[] = [
  ReservationStatus.CANCELLED,
  ReservationStatus.EXPIRED,
  ReservationStatus.REJECTED,
];

// Estados desde los que el ciudadano NO puede cancelar (ya cerrados o aprobados).
export const NON_CANCELLABLE_RESERVATION_STATUSES: ReservationStatus[] = [
  ReservationStatus.APPROVED,
  ...INACTIVE_RESERVATION_STATUSES,
];
