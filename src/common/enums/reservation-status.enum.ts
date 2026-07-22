export enum ReservationStatus {
  PENDING_PAYMENT = 'pending_payment',
  UNDER_REVIEW = 'under_review',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  // CR-4: cancha con boleta recién creada, esperando la PRIMERA confirmación.
  PENDING_CONFIRMATION = 'pending_confirmation',
}

// Estados "muertos": la reserva ya no ocupa el recurso. Desde CR-4 los
// backstops de BD (excl_court_overlap / uq_ranch_active_booking) usan este
// MISMO set con NOT IN: un estado nuevo cuenta como activo por defecto.
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
