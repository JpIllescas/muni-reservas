import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../interfaces/auth-user.interface';

// ADM-1 — Solo el super-admin (flag isSuperAdmin) puede gestionar sedes y la asignación de admins/operadores a sedes.
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user) {
      return false;
    }
    return user.isSuperAdmin === true;
  }
}
