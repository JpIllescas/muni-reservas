import { ForbiddenException } from '@nestjs/common';
import { AuthUser } from '../interfaces/auth-user.interface';

// ADM-1 — Alcance multi-sede para las vistas admin/operador.
// Regla única: el super-admin ve/gestiona TODAS las sedes.
export function hasGlobalSedeAccess(user: AuthUser): boolean {
  return user.isSuperAdmin;
}

// Autorización por-id: lanza Forbidden si el actor no puede actuar sobre un recurso de `sedeId`.
export function assertSedeAccess(user: AuthUser, sedeId: string): void {
  if (user.isSuperAdmin) {
    return;
  }
  if (!user.sedeIds.includes(sedeId)) {
    throw new ForbiddenException('No tienes acceso a recursos de esta sede.');
  }
}
