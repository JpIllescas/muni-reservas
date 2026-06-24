import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

// ADM-1 — Solo el super-admin (flag isSuperAdmin) puede gestionar sedes y la
// asignación de admins/operadores a sedes. El RolesGuard no sirve aquí porque
// el super-admin es un flag, no un rol. Fail-closed: niega si no hay usuario.
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      return false;
    }
    return user.isSuperAdmin === true;
  }
}
