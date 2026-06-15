import { Role } from '../enums/role.enum';

// Forma del usuario que la JwtStrategy.validate() inyecta en request.user.
// Es lo que reciben los controladores vía @CurrentUser().
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  fullName: string;
}
