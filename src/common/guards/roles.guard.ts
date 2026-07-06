import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../enums/role.enum';
import type { AuthUser } from '../interfaces/auth-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();

    // Defensa: si por algún motivo no hay usuario en la request (p. ej. una ruta
    // con @Roles a la que se le olvidó poner JwtAuthGuard), negamos en vez de
    // reventar con un 500 al leer user.role.
    if (!user) {
      return false;
    }

    return requiredRoles.includes(user.role);
  }
}
