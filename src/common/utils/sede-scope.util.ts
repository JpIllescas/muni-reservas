import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../interfaces/auth-user.interface';

// ADM-1 — Alcance multi-sede para las vistas admin/operador.
//
// Regla única: el super-admin ve/gestiona TODAS las sedes; cualquier otro
// admin/operador queda acotado a `user.sedeIds`. Fail-closed: un actor sin el
// flag y sin sedes asignadas no accede a nada.
//
// Los endpoints CIUDADANOS son sede-agnósticos (un ciudadano reserva en
// cualquier sede) y NO deben usar estos helpers.

// ¿El actor ve todas las sedes (sin filtro)?
export function hasGlobalSedeAccess(user: AuthUser): boolean {
  return user.isSuperAdmin;
}

// Autorización por-id: lanza Forbidden si el actor no puede actuar sobre un
// recurso de `sedeId`. No-op para el super-admin.
export function assertSedeAccess(user: AuthUser, sedeId: string): void {
  if (user.isSuperAdmin) {
    return;
  }
  if (!user.sedeIds.includes(sedeId)) {
    throw new ForbiddenException('No tienes acceso a recursos de esta sede.');
  }
}
