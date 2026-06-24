import { Role } from '../enums/role.enum';

// Forma del usuario que la JwtStrategy.validate() inyecta en request.user.
// Es lo que reciben los controladores vía @CurrentUser().
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  // ADM-1: alcance multi-sede. `isSuperAdmin` saltea el filtro de sede; si es
  // false, el actor solo puede ver/gestionar reservas y recursos de `sedeIds`.
  isSuperAdmin: boolean;
  sedeIds: string[];
}
