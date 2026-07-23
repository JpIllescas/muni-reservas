import { Role } from '../enums/role.enum';

// Forma del usuario que la JwtStrategy.validate() inyecta en request.user.
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  fullName: string;

  // alcance multi-sede. `isSuperAdmin` saltea el filtro de sede; si es false, el actor solo puede ver/gestionar reservas y recursos de `sedeIds`.
  isSuperAdmin: boolean;
  sedeIds: string[];
}
